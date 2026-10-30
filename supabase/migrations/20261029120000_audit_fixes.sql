-- =============================================================================
-- M2 · Correction après audit (décisions validées) :
-- 1. offers : la politique publique appelait is_admin(), non exécutable par
--    anon → les offres étaient ILLISIBLES par les visiteurs. Séparation :
--    les actives (anon + authenticated), le tout (admin uniquement).
-- 2. Fonctions trigger (handle_new_user, set_updated_at, audit_logs_append_only)
--    : EXECUTE révoqué de public/anon/authenticated — aucun appel SQL direct
--    possible ; les triggers continuent de s'exécuter (privilege vérifié à la
--    création du trigger, testé avant application de cette migration).
-- 3. RPC d'audit : liste les tables du schéma public sans RLS activée
--    (service-role uniquement) — consommée par tests/rls-anon-whitelist.test.ts.
-- =============================================================================

drop policy offers_select_public on public.offers;

create policy offers_select_active on public.offers
  for select to anon, authenticated
  using (is_active = true);

create policy offers_select_admin on public.offers
  for select to authenticated
  using (public.is_admin());

-- Trigger functions : pas d'appel SQL direct possible, aucun besoin client.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.audit_logs_append_only() from public, anon, authenticated;

-- Audit « visible par conception » : tables sans RLS. Refus par défaut :
-- service-role uniquement (aucun grant anon/authenticated).
create or replace function public.audit_rls_status()
returns table (table_name text, rls_enabled boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.relname::text, c.relrowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r';
$$;
revoke execute on function public.audit_rls_status() from public, anon, authenticated;
grant execute on function public.audit_rls_status() to service_role;
