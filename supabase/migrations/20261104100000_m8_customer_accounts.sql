-- ============================================================================
-- M8 (bloc 0a) — Compte client automatique après commande confirmée.
-- PRD §8/§9 : le compte est créé APRÈS le paiement confirmé (les inscriptions
-- publiques restent désactivées) ; le lien de connexion est généré par
-- admin.generateLink et envoyé par NOTRE Mailer (outbox idempotent) —
-- JAMAIS via signInWithOtp public.
--
-- 1) email_outbox : nouvel event_type 'pdf_access' (e-mail « accès aux PDF »,
--    qui ne contient NI fichier NI lien de téléchargement — seulement le lien
--    de connexion vers l'espace client).
-- 2) find_auth_user_id_by_email : retrouver un compte existant par e-mail
--    normalisé (service-role uniquement — auth.users n'est jamais exposé).
-- 3) link_customers_to_profile : liaison customers.profile_id après
--    vérification de l'e-mail par le lien — idempotente, TOUTES les lignes
--    du même e-mail, JAMAIS une ligne déjà liée à un autre utilisateur
--    (la RLS client owns_order dépend de customers.profile_id = auth.uid()).
-- 4) L'index unique M1 customers_profile_unique (1 profil = 1 client) est
--    remplacé par un index ordinaire : un même client peut avoir PLUSIEURS
--    lignes customers (commande passée au téléphone puis par e-mail) et la
--    liaison M8 doit couvrir TOUTES les lignes du même e-mail. owns_order
--    reste exact : le profil voit les commandes de ses lignes — la même
--    personne, rien d'autre.
-- ============================================================================

-- 1) email_outbox : élargissement de l'énumération d'événements.
alter table public.email_outbox
  drop constraint email_outbox_event_type_check;
alter table public.email_outbox
  add constraint email_outbox_event_type_check
  check (event_type in ('payment_confirmed', 'payment_rejected', 'pdf_access'));

comment on constraint email_outbox_event_type_check on public.email_outbox is
  'pdf_access : e-mail « accès aux PDF » (M8) — lien de connexion uniquement, '
  'jamais de fichier ni de lien de téléchargement direct.';

-- 2) Retrouver un compte auth existant par e-mail normalisé.
--    security definer (lecture auth.users) ; exécution service-role
--    UNIQUEMENT : ni anon, ni authenticated, ni public.
create or replace function public.find_auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from auth.users
  where lower(trim(email)) = lower(trim(p_email))
  limit 1;
$$;

revoke execute on function public.find_auth_user_id_by_email(text)
  from public, anon, authenticated;
grant execute on function public.find_auth_user_id_by_email(text) to service_role;

-- 3) Liaison idempotente customers ↔ profil, après vérification de l'e-mail
--    par le lien de connexion (JAMAIS avant — un e-mail non vérifié ne lie
--    rien). Toutes les lignes du même e-mail normalisé ; les lignes déjà
--    liées à CET utilisateur restent inchangées ; une ligne liée à un AUTRE
--    utilisateur n'est jamais retouchée (pas de vol de commande).
create or replace function public.link_customers_to_profile(
  p_email text,
  p_profile_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_email is null or p_profile_id is null then
    raise exception 'P8001';
  end if;

  update public.customers c
  set profile_id = p_profile_id,
      updated_at = now()
  where lower(trim(c.email)) = lower(trim(p_email))
    and (c.profile_id is null or c.profile_id = p_profile_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.link_customers_to_profile(text, uuid)
  from public, anon, authenticated;
grant execute on function public.link_customers_to_profile(text, uuid) to service_role;

-- 4) Un profil peut être lié à plusieurs lignes customers (M8 — voir
--    en-tête) : l'index unique M1 devient un index ordinaire de recherche.
drop index if exists public.customers_profile_unique;
create index customers_profile_idx on public.customers (profile_id)
  where profile_id is not null;
