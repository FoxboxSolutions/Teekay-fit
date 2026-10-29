# Environnements

Un projet Supabase par environnement. Aucune donnée, aucun secret n'est partagé entre eux.

| Environnement | Projet Supabase | Usage |
| --- | --- | --- |
| **Développement** | projet local `supabase start` (ou projet cloud dédié `teekayfit-dev`) | développement quotidien, migrations testées, tests RLS |
| **Préproduction** | projet cloud `teekayfit-staging` | validation avant mise en production, tests d'intégration fournisseur de paiement (M7) |
| **Production** | projet cloud `teekayfit-prod` | `teekay.fit` — aucune manipulation manuelle hors procédure documentée |

## Règles

1. **Migrations versionnées** : tout changement de schéma passe par un fichier SQL daté dans `supabase/migrations/`. Aucun altéraction manuelle du schéma depuis le dashboard en production.
2. **Développement local** : `npx supabase start` (exige Docker Desktop) — base sur le port 54322, API sur 54321. `npx supabase db reset` rejoue toutes les migrations.
3. **Passage en préproduction/production** : `npx supabase link --project-ref <ref>` puis `npx supabase db push`. Le link n'est jamais commité (`.temp/` ignoré).
4. **Variables d'environnement** : voir `.env.example` (aucune valeur). Chaque environnement a ses propres valeurs, injectées par le gestionnaire de secrets de l'hébergeur. Jamais de secret dans `NEXT_PUBLIC_*`.
5. **Clés** : `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publiables) côté client ; `SUPABASE_SERVICE_ROLE_KEY` côté serveur uniquement (module `src/lib/supabase/admin.ts`, testé automatiquement).
6. **RLS** : activée sur toutes les tables dès leur création, en refus par défaut ; `auto_expose_new_tables = false` — toute exposition API passe par un GRANT explicite dans une migration.
