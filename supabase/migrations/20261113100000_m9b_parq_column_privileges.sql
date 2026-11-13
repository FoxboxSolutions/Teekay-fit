-- M9b — minimisation PAR-Q : les 7 colonnes de réponses (données de santé)
-- ne sont plus lisibles par aucun rôle client (anon / authenticated).
-- Preuve du défaut (M9b, base locale) : un admin aal1 (SANS MFA), un admin
-- aal2 et un client propriétaire lisaient les 7 réponses directement via
-- l'API REST PostgREST (GET /rest/v1/aptitude_questionnaires) avec leur
-- propre JWT — sans passer par POST /api/admin/par-q, donc sans audit.
--
-- Cause : `grant select on public.aptitude_questionnaires to authenticated`
-- (20261029100100_rls_policies.sql l.456) est un GRANT au niveau TABLE : il
-- accorde SELECT sur TOUTES les colonnes, y compris q1..q7
-- (20261029100000_phase1_schema.sql l.424-430). Un GRANT au niveau table
-- masque toute révocation au niveau colonnes : on révoque donc le SELECT au
-- niveau table, puis on accorde SELECT UNIQUEMENT sur les 3 colonnes non
-- sensibles lues par les pages admin avec la session (clients page l.104,
-- a-traiter page l.130).
--
-- Sont conservés SANS modification :
--  - les politiques RLS (20261029100100_rls_policies.sql l.268-274 :
--    aptitude_questionnaires_select_own, aptitude_questionnaires_select_admin)
--    : elles continuent de gouverner QUELLES lignes sont visibles ;
--  - les droits de service_role (lecture + écriture complètes : la route
--    auditée POST /api/admin/par-q garde son accès) ;
--  - les droits d'écriture (INSERT/UPDATE) et la fonction security definer
--    create_order (20261103100000_m6_create_order.sql l.262).
-- anon n'a jamais eu de SELECT (relacl : anon=Dxtm) : révocation défensive,
-- no-op si déjà absente.

revoke select on public.aptitude_questionnaires from authenticated;
revoke select on public.aptitude_questionnaires from anon;

grant select (order_id, medical_advice_recommended, created_at)
  on public.aptitude_questionnaires to authenticated;
