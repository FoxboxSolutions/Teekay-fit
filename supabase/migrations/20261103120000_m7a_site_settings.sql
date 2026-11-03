-- ============================================================================
-- M7a (bloc 1) — Paramètres exploitables par le propriétaire
--
-- Instructions BaridiMob + fenêtre de paiement : configurés EN BASE par le
-- propriétaire (éditable par un admin), JAMAis en dur dans le dépôt.
-- Le numéro de compte est marqué `is_secret = true` : jamais loggi, jamais
-- placé dans un événement ni un audit (sepritant uniquement servi à la page).
--
-- RLS : aucune lecture anonyme/authentifiée (la page publique lit via le
-- serveur, service role) ; lecture admin ; écriture admin EXIGEANT aal2.
-- ============================================================================

create table if not exists public.site_settings (
  key        text primary key,
  value      text not null check (char_length(value) <= 5000),
  is_secret  boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

-- Lecture : uniquement les admins (alias use-case : vérification admin UI).
create policy site_settings_admin_select on public.site_settings
  for select to authenticated
  using (is_admin());

-- Écriture : admin ET session MFA vérifiée (aal2) — aucune configuration
-- de paiement modifiable depuis une session sans second facteur.
create policy site_settings_admin_insert on public.site_settings
  for insert to authenticated
  with check (is_admin() and coalesce((auth.jwt() ->> 'aal'), 'aal1') = 'aal2');

create policy site_settings_admin_update on public.site_settings
  for update to authenticated
  using (is_admin() and coalesce((auth.jwt() ->> 'aal'), 'aal1') = 'aal2')
  with check (is_admin() and coalesce((auth.jwt() ->> 'aal'), 'aal1') = 'aal2');

-- (pas de DELETE : les clés de plus ne disparaissent jamais)

-- ----------------------------------------------------------------------------
-- Helper de vérification admin + aal2 (réutilisation M7a : confirmation IA/admin).
-- ----------------------------------------------------------------------------
create or replace function public.is_admin_aal2() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin' and revoked_at is null
  ))
  and coalesce((auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

-- ----------------------------------------------------------------------------
-- Fenêtre de paiement : durée de validité d'une commande pending_payment.
-- Expiration automatique en M12 (pg_cron) ; d'ici là la page de statut affiche
-- la fenêtre expirée avec un message clair, sans faux succès.
-- ----------------------------------------------------------------------------
create or replace function public.payment_window_hours() returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select nullif(value, '')::integer
    from public.site_settings
    where key = 'payment_window_hours'
  ), 48)::integer;
$$;

-- ----------------------------------------------------------------------------
-- RPC : upsert d'un paramètre par un admin (aal2 strict), whitelist de clés,
-- validation de la fenêtre. Chaque changement tracé dans audit_logs
-- (acteur, action, horodatage) — JAMAIS la valeur (numéro de compte).
-- ----------------------------------------------------------------------------
create or replace function public.admin_upsert_setting(
  p_key         text,
  p_value       text,
  p_is_secret   boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_aal2() then
    raise exception 'droit_admin_aal2_requis' using errcode = 'P5001';
  end if;
  if p_key not in ('baridimob.account', 'baridimob.bank', 'baridimob.beneficiary',
                   'baridimob.note', 'payment_window_hours') then
    raise exception 'cle_inconnue' using errcode = 'P5002';
  end if;
  if char_length(p_value) > 5000 then
    raise exception 'valeur_trop_longue' using errcode = 'P5003';
  end if;
  if p_key = 'payment_window_hours' then
    if not (p_value ~ '^[1-9][0-9]*$' and coalesce(p_value, '')::integer between 1 and 720) then
      raise exception 'fenetre_invalide' using errcode = 'P5004';
    end if;
  end if;

  insert into public.site_settings (key, value, is_secret, updated_by)
  values (p_key, p_value, p_is_secret, auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        is_secret = excluded.is_secret,
        updated_by = excluded.updated_by;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'admin',
    'site_setting_upsert',
    'site_settings',
    p_key,
    jsonb_build_object(
      'is_secret', p_is_secret
    )  -- jamais la valeur : le numéro de compte ne figure ni dans les journaux ni dans les événements
  );
end;
$$;

-- Grants : le « grant all on all tables » de la migration 0002 ne couvre pas
-- les tables créées après — service role pour la lecture serveur, exécution
-- des fonctions pour les rôles concernés. AUCUN grant table pour anon ou
-- authenticated : la lecture publique passe par le serveur, jamais en REST
-- direct ; l'écriture passe strictement par admin_upsert_setting (aal2).
grant all on public.site_settings to service_role;
grant execute on function public.admin_upsert_setting(text, text, boolean) to authenticated, service_role;
grant execute on function public.is_admin_aal2() to authenticated, service_role;
grant execute on function public.payment_window_hours() to authenticated, anon, service_role;
