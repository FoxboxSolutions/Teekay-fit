-- ============================================================================
-- M8 (bloc 2b) — expiration des droits d'accès.
--
-- entitlements.expires_at :
--  - null = sans expiration (PDF Starter livrés à vie, défaut M8) ;
--  - date = droit à durée (coaching daté, offres pack — Phase 2 M13) ;
--  - un droit EXPIRÉ n'est jamais présenté comme actif (page « Mes
--    commandes ») et la route /api/downloads répond 404 neutre, au même
--    titre qu'un droit révoqué ou absent.
-- Les droits déjà ouverts (M7a) restent null : sans expiration, comportement
-- inchangé pour les livraisons passées.
-- ============================================================================

alter table public.entitlements
  add column if not exists expires_at timestamptz;

comment on column public.entitlements.expires_at is
  'Expiration du droit d''accès (null = sans expiration, PDF Starter). '
  'Un droit expiré = 404 neutre côté téléchargement, jamais présenté actif.';
