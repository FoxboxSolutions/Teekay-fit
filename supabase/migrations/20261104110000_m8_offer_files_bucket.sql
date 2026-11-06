-- ============================================================================
-- M8 (bloc 1) — Stockage privé des fichiers d'offres (PDF sources Starter).
--
-- Règles M8 (PRD §18 — Fichiers) :
--  - bucket PRIVÉ (public = false) : AUCUNE URL publique possible ;
--  - AUCUNE politique de lecture/écriture directe sur storage.objects pour
--    anon/authenticated : la RLS par défaut REFUSE tout — ni upload client,
--    ni lecture directe ; les téléchargements passent par la route serveur
--    (service-role, droit vérifié + filigrane à la volée) ;
--  - limites : source PDF, 20 Mo max (la génération du filigrane refait un
--    PDF égal ou plus léger — la limite de flux est appliquée côté serveur) ;
--  - les PDF originaux ne sont JAMAIS servis tels quels : la route
--    /api/downloads charge la source, tamponne, puis renvoie le PDF
--    filigrané — la source reste dans le bucket privé.
--
-- Le dépôt manuel des PDF Starter (script fourni en docs/offer-files-depot.md)
-- se fait via le service-role ; l'interface d'upload admin reste en M9.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'offer-files', 'offer-files', false, 20 * 1024 * 1024,
  array['application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 20 * 1024 * 1024,
      allowed_mime_types = array['application/pdf'];

-- AUCUNE policy sur storage.objects pour ce bucket (ni pour aucun autre
-- d'ailleurs) : RLS par défaut = refus. Les seuls accès sont :
--  - service-role (lecture/écriture serveur, hors RLS) ;
--  - admin via la route serveur (M9 — interface d'upload).
--
-- NB : storage.objects porte déjà RLS activée par défaut dans Supabase ;
-- ne JAMAIS créer de policy `using (true)` ou par bucket ici — c'est la
-- faille testée par tests/m8-storage-rls.test.ts.
