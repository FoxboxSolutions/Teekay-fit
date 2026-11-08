-- ============================================================================
-- M8 (bloc 5) — Enregistrer un PDF Starter d�?pos�? manuellement.
--
-- Script idempotent : ins�?re (ou met �? jour) la ligne `offer_files`
-- correspondant �? un fichier D�?J�? envoy�? dans le bucket PRIV�? `offer-files`
-- par la proc�?dure de docs/offer-files-depot.md. Rejouer la commande ne
-- cr�?e JAMAIS de doublon : l'upsert porte sur `storage_path` (unique).
--
-- Aucune valeur r�?elle dans ce fichier : tout passe par des variables psql
-- fournies �? l'ex�?cution (jamais de secret dans le d�?p�t — les cl�s vivent
-- dans l'environnement, voir docs/environments.md).
--
-- Ex�?cution (d�?tails et exemples dans docs/offer-files-depot.md) :
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v offer_id=<OFFER_UUID> \
--     -v storage_path=<CHEMIN_DANS_LE_BUCKET> \
--     -v label=<LIBELLE_AFFICHE> \
--     -f scripts/offer-files-insert.sql
--
-- Variable manquante ? Le script �?choue (code d'exit non nul) au lieu
-- d'ins�?rer n'importe quoi : aucun garde silencieux.
-- ============================================================================

\if :{?offer_id}
\else
  \echo 'ERREUR : variable psql manquante -> -v offer_id=<OFFER_UUID>'
  \set offer_id 'offre_uuid_manquante'
\endif

\if :{?storage_path}
\else
  \echo 'ERREUR : variable psql manquante -> -v storage_path=<CHEMIN_DANS_LE_BUCKET>'
  \set storage_path 'chemin/manquant'
\endif

\if :{?label}
\else
  \echo 'ERREUR : variable psql manquante -> -v label=<LIBELLE_AFFICHE>'
  \set label 'libelle/manquant'
\endif

begin;

insert into public.offer_files (offer_id, storage_path, label, file_kind)
values (:'offer_id'::uuid, :'storage_path', :'label', 'pdf')
on conflict (storage_path) do update
  set offer_id = excluded.offer_id,
      label    = excluded.label;

commit;

select id, offer_id, storage_path, label, file_kind
from public.offer_files
where storage_path = :'storage_path';
