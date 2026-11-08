# Dépôt des fichiers PDF des offres

Procédure M8 — mise à disposition des deux PDF inclus dans l'offre
**Starter** (programme d'entraînement, programme de nutrition). Le dépôt
est **manuel** en M8 : l'interface d'upload admin arrive en **M9**
(incohérence §21 n°7 tranchée — voir `supabase/migrations/` et la table
`offer_files` du schéma Phase 1).

> **Secrets** : aucune valeur secrète dans ce document. L'upload se fait
> avec la variable d'environnement `SUPABASE_SERVICE_ROLE_KEY` de
> l'environnement concerné (voir `docs/environments.md`). Les valeurs
> entre `<guillemets>` sont des variables à remplacer, jamais des
> identifiants réels.

## 1. Règles (PRD §18 — Fichiers)

- Bucket **privé** `offer-files` : aucune URL publique, aucune politique
  de lecture/écriture pour `anon` / `authenticated` (M8 bloc 1) — seule
  l'application (service-role) y touche.
- La source n'est **jamais** servie telle quelle : `/api/downloads` charge
  la source, applique le filigrane (référence + téléphone masqué) et
  renvoie un PDF personnel.
- 20 Mo maximum par PDF source (la génération du filigrane refait un PDF
  égal ou plus léger — limite de flux appliquée côté serveur).
- Aucun PDF dans Git : les sources vivent dans le bucket. `.gitignore`
  refuse `*.pdf` (sauf `tests/fixtures/`) et la CI échoue si un PDF est
  tracké hors de ce dossier (`scripts/check-pdfs.mjs`).
- L'e-mail d'accès ne contient **ni fichier ni lien de téléchargement** :
  seulement un lien de connexion vers l'espace client (M8 bloc 3b).

## 2. Étape 1 — identifiant de l'offre

```sql
select id, slug from public.offers where slug = 'starter';
```

La colonne `id` devient `<OFFER_UUID>` (variable de l'étape 3).

## 3. Étape 2 — envoyer le PDF dans le bucket privé (service-role)

```bash
curl -X POST "$SUPABASE_URL/storage/v1/object/offer-files/starter/programme-entrainement.pdf" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/pdf" \
  --data-binary @/chemin/local/programme-entrainement.pdf
```

Répéter pour le second fichier
(`starter/programme-nutrition.pdf`).

Remplacer un fichier déjà déposé : **même chemin** + en-tête
`-H "x-upsert: true"` (la ligne `offer_files` de l'étape 3 reste valable,
`storage_path` est unique).

Le chemin dans le bucket est un identifiant stable : `starter/<nom-du-fichier>.pdf`.

## 4. Étape 3 — enregistrer la ligne `offer_files` (script idempotent)

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v offer_id=<OFFER_UUID> \
  -v storage_path=starter/programme-entrainement.pdf \
  -v label="Programme d'entraînement (PDF)" \
  -f scripts/offer-files-insert.sql
```

Sur la stack locale (conteneur Docker, projet défini dans
`supabase/config.toml`) :

```bash
docker exec -i supabase_db_<project_id> psql -U postgres -v ON_ERROR_STOP=1 \
  -v offer_id=<OFFER_UUID> \
  -v storage_path=starter/programme-entrainement.pdf \
  -v label="Programme d'entraînement (PDF)" \
  -f - < scripts/offer-files-insert.sql
```

Le script est idempotent : il **rejoue sans jamais dupliquer** (upsert sur
`storage_path`), met à jour `label` / `offer_id`, et échoue (code non nul)
si une variable manque. `file_kind` vaut toujours `pdf`.

## 5. Étape 4 — vérifier

```sql
select f.storage_path, f.label, o.slug
from public.offer_files f
join public.offers o on o.id = f.offer_id
where o.slug = 'starter'
order by f.created_at;
```

Un client ne voit ce fichier qu'après paiement confirmé, depuis
`/fr/account`, via `/api/downloads/…` : session requise, droit vérifié
côté serveur, quota quotidien, PDF filigrané.

## 6. Étape 5 — retirer un fichier

Dans cet ordre : l'objet du bucket, puis la ligne.

```bash
curl -X DELETE "$SUPABASE_URL/storage/v1/object/offer-files/starter/programme-entrainement.pdf" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

```sql
delete from public.offer_files
where storage_path = 'starter/programme-entrainement.pdf';
```

## 7. Tests

- `tests/m8-offer-files-depot.test.ts` exécute **réellement** le script
  sur la base locale (insert + rejeu idempotent + échec sur variable
  manquante + nettoyage), vérifie le contenu de ce document, le
  `.gitignore` (`git check-ignore`) et la garde CI.
- `tests/m8-storage-rls.test.ts` couvre le bucket privé (upload
  service-role, refus anonyme/authentifié).

Hors périmètre M8 : interface d'upload admin (**M9**), portail complet
(**M13**).
