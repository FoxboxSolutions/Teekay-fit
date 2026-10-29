-- =============================================================================
-- M2 · RLS + contrôles d'autorisation (complète la migration 0001)
-- Refus par défaut : chaque table a déjà RLS activée ; les politiques
-- suivantes sont les SEULES accès accordés. GRANTs explicites (config :
-- auto_expose_new_tables = false).
-- Rôles : user_roles n'est modifiable que via service-role ou les RPC admin
-- ci-dessous, avec trace dans audit_logs ; seul audit_logs est en ajout seul.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- Vrai si l'utilisateur courant a le rôle admin actif.
-- SECURITY DEFINER : lit user_roles sans dépendre des politiques de lecture
-- de cette table (évite la récursion), elle-même à accès restreint.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
      and revoked_at is null
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Vrai si la commande appartient au profil courant (pour RLS orders/…).
create or replace function public.owns_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = p_order_id
      and c.profile_id = auth.uid()
  );
$$;
revoke execute on function public.owns_order from public, anon;
grant execute on function public.owns_order to authenticated, service_role;

-- Vrai si le client appartient au profil courant.
create or replace function public.owns_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers
    where id = p_customer_id
      and profile_id = auth.uid()
  );
$$;
revoke execute on function public.owns_customer from public, anon;
grant execute on function public.owns_customer to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- profiles : chacun lit/édite le sien ; admin lit tout
-- -----------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- user_roles : lecture du rôle propre (session) + lecture admin.
-- AUCUNE politique d'écriture client → impossible de s'attribuer un rôle.
-- Écriture : service-role uniquement, via les RPC admin auditées ci-dessous.
-- -----------------------------------------------------------------------------
create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

create policy user_roles_select_admin on public.user_roles
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- offers : lecture des offres actives pour le site ; admin gère tout
-- -----------------------------------------------------------------------------
create policy offers_select_public on public.offers
  for select to anon, authenticated
  using (is_active = true or public.is_admin());

create policy offers_admin_all on public.offers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- offer_files : admin uniquement (fichiers privés)
-- -----------------------------------------------------------------------------
create policy offer_files_admin_all on public.offer_files
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- leads : admin uniquement côté client ; créés côté serveur (M5, service-role)
-- -----------------------------------------------------------------------------
create policy leads_admin_all on public.leads
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- quiz_submissions : admin uniquement côté client ; créées côté serveur (M5)
-- -----------------------------------------------------------------------------
create policy quiz_submissions_admin_all on public.quiz_submissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- customers : chacun lit le sien ; admin lit tout
-- -----------------------------------------------------------------------------
create policy customers_select_own on public.customers
  for select to authenticated
  using (profile_id = auth.uid());

create policy customers_select_admin on public.customers
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- orders : chacun lit les siennes (via son customer) ; admin lit tout
-- -----------------------------------------------------------------------------
create policy orders_select_own on public.orders
  for select to authenticated
  using (exists (
    select 1 from public.customers c
    where c.id = orders.customer_id
      and c.profile_id = auth.uid()
  ));

create policy orders_select_admin on public.orders
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- order_items : chacun lit les siens ; admin lit tout
-- -----------------------------------------------------------------------------
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (public.owns_order(order_id));

create policy order_items_select_admin on public.order_items
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- payments : chacun lit les siens ; admin lit et vérifie (M7)
-- -----------------------------------------------------------------------------
create policy payments_select_own on public.payments
  for select to authenticated
  using (public.owns_order(order_id));

create policy payments_select_admin on public.payments
  for select to authenticated
  using (public.is_admin());

create policy payments_admin_update on public.payments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- payment_events : admin uniquement (événements fournisseur, côté serveur)
-- -----------------------------------------------------------------------------
create policy payment_events_admin_select on public.payment_events
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- promo_codes : admin uniquement ; validation côté serveur (M6, service-role)
-- -----------------------------------------------------------------------------
create policy promo_codes_admin_all on public.promo_codes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- referrals : référenceur lit les siens ; admin lit tout
-- -----------------------------------------------------------------------------
create policy referrals_select_own on public.referrals
  for select to authenticated
  using (exists (
    select 1 from public.customers c
    where c.id = referrals.referrer_customer_id
      and c.profile_id = auth.uid()
  ));

create policy referrals_select_admin on public.referrals
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- capacity_slots : lecture publique (places restantes réelles) ; admin gère
-- -----------------------------------------------------------------------------
create policy capacity_slots_select_public on public.capacity_slots
  for select to anon, authenticated
  using (true);

create policy capacity_slots_admin_all on public.capacity_slots
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- receipts : chacun lit les siens ; admin lit tout
-- -----------------------------------------------------------------------------
create policy receipts_select_own on public.receipts
  for select to authenticated
  using (public.owns_order(order_id));

create policy receipts_select_admin on public.receipts
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- consents : chacun lit les siens (profil ou commande) ; admin lit tout
-- -----------------------------------------------------------------------------
create policy consents_select_own on public.consents
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (order_id is not null and public.owns_order(order_id))
  );

create policy consents_select_admin on public.consents
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- audit_logs : administrateurs uniquement ; écriture = service-role / RPC
-- (l'append-only est assuré par le trigger de la migration 0001)
-- -----------------------------------------------------------------------------
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- aptitude_questionnaires : accès restreint — propriétaire de la commande ou
-- admin, aucun autre. Écriture : service-role uniquement (côté serveur M6).
-- -----------------------------------------------------------------------------
create policy aptitude_questionnaires_select_own on public.aptitude_questionnaires
  for select to authenticated
  using (public.owns_order(order_id));

create policy aptitude_questionnaires_select_admin on public.aptitude_questionnaires
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- rate_limit_counters : aucune politique → inaccessible côté client
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- RPC admin : attribution/révocation de rôle avec audit.
-- Appelables uniquement par un admin authentifié ou le service-role.
-- -----------------------------------------------------------------------------
create or replace function public.admin_grant_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    if coalesce(current_setting('request.jwt.claims', true), '') not like '%"role":"service_role"%' then
      raise exception 'non autorisé';
    end if;
  elsif not public.is_admin() then
    raise exception 'non autorisé';
  end if;

  if p_role not in ('admin') then
    raise exception 'rôle inconnu : %', p_role;
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = p_role and revoked_at is null
  ) then
    return;
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (p_user_id, p_role, v_actor);

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    coalesce(v_actor::text, 'service_role'),
    'role.grant',
    'user_roles',
    p_user_id::text,
    jsonb_build_object('role', p_role)
  );
end;
$$;
revoke execute on function public.admin_grant_role from public, anon;
grant execute on function public.admin_grant_role to authenticated, service_role;

create or replace function public.admin_revoke_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    if coalesce(current_setting('request.jwt.claims', true), '') not like '%"role":"service_role"%' then
      raise exception 'non autorisé';
    end if;
  elsif not public.is_admin() then
    raise exception 'non autorisé';
  end if;

  update public.user_roles
  set revoked_at = now(), revoked_by = v_actor
  where user_id = p_user_id
    and role = p_role
    and revoked_at is null;

  if found then
    insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
    values (
      v_actor,
      coalesce(v_actor::text, 'service_role'),
      'role.revoke',
      'user_roles',
      p_user_id::text,
      jsonb_build_object('role', p_role)
    );
  end if;
end;
$$;
revoke execute on function public.admin_revoke_role from public, anon;
grant execute on function public.admin_revoke_role to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC limitation de débit : incrément atomique par fenêtre glissante simple.
-- Sécurisée (security definer, table privée) — appelée côté serveur uniquement.
-- -----------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_bucket is null or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.rate_limit_counters (bucket_key, window_start, hit_count)
  values (p_bucket, now(), 1)
  on conflict (bucket_key) do update
    set
      hit_count = case
        when public.rate_limit_counters.window_start < now() - make_interval(secs => p_window_seconds)
        then 1
        else public.rate_limit_counters.hit_count + 1
      end,
      window_start = case
        when public.rate_limit_counters.window_start < now() - make_interval(secs => p_window_seconds)
        then now()
        else public.rate_limit_counters.window_start
      end
  returning hit_count into v_count;

  return v_count <= p_limit;
end;
$$;
revoke execute on function public.check_rate_limit from public, anon, authenticated;
grant execute on function public.check_rate_limit to service_role;

-- purge des compteurs expirés (> 1 jour), appelée avec check_rate_limit côté serveur
create or replace function public.purge_expired_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit_counters
  where window_start < now() - interval '1 day';
$$;
revoke execute on function public.purge_expired_rate_limits from public, anon, authenticated;
grant execute on function public.purge_expired_rate_limits to service_role;

-- -----------------------------------------------------------------------------
-- GRANTs explicites (auto_expose_new_tables = false) — RLS filtre les lignes.
-- Aucun INSERT/UPDATE/DELETE client sauf indications ci-dessous ; les
-- écritures métier passent par le service-role (route serveur).
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles                to authenticated;
grant update on public.profiles                to authenticated;
grant select on public.user_roles              to authenticated;
grant select, insert, update, delete on public.offers to authenticated;
grant select, insert, update, delete on public.offer_files to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.quiz_submissions to authenticated;
grant select on public.customers               to authenticated;
grant select on public.orders                  to authenticated;
grant select on public.order_items             to authenticated;
grant select, update on public.payments        to authenticated;
grant select on public.payment_events          to authenticated;
grant select, insert, update, delete on public.promo_codes to authenticated;
grant select on public.referrals               to authenticated;
grant select, insert, update, delete on public.capacity_slots to authenticated;
grant select on public.receipts                to authenticated;
grant select on public.consents                to authenticated;
grant select on public.audit_logs              to authenticated;
grant select on public.aptitude_questionnaires to authenticated;

grant select on public.offers to anon;
grant select on public.capacity_slots to anon;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
