# Environnements

Un projet Supabase par environnement. Aucune donnée, aucun secret n'est partagé entre eux.

| Environnement | Projet Supabase | Usage |
| --- | --- | --- |
| **Développement** | projet local `supabase start` (ou projet cloud dédié `teekayfit-dev`) | développement quotidien, migrations testées, tests RLS |
| **Préproduction** | projet cloud `teekayfit-staging` | validation avant mise en production, tests d'intégration fournisseur de paiement (M7) |
| **Production** | projet cloud `teekayfit-prod` | `teekay.fit` — aucune manipulation manuelle hors procédure documentée |

## Règles

1. **Migrations versionnées** : tout changement de schéma passe par un fichier SQL daté dans `supabase/migrations/`. Aucun altéraction manuelle du schéma depuis le dashboard en production.
2. **Développement local** : `npx supabase start` (exige Docker Desktop) — base sur le port 25432, API sur 54470. `npx supabase db reset` rejoue toutes les migrations. *Ports locaux déplacés hors plage 54170-54469, réservée par Hyper-V/WINNAT sur Windows (bind refusé sans droits admin) : DB 25432, shadow 25430, API 54470, pooler 54471, Studio 54472, SMTP 54473, analytics 54474.*
3. **Passage en préproduction/production** : `npx supabase link --project-ref <ref>` puis `npx supabase db push`. Le link n'est jamais commité (`.temp/` ignoré).
4. **Variables d'environnement** : voir `.env.example` (aucune valeur). Chaque environnement a ses propres valeurs, injectées par le gestionnaire de secrets de l'hébergeur. Jamais de secret dans `NEXT_PUBLIC_*`.
5. **Clés** : `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publiables) côté client ; `SUPABASE_SERVICE_ROLE_KEY` côté serveur uniquement (module `src/lib/supabase/admin.ts`, testé automatiquement).
6. **RLS** : activée sur toutes les tables dès leur création, en refus par défaut ; `auto_expose_new_tables = false` — toute exposition API passe par un GRANT explicite dans une migration.

## APP_ENV

Variable serveur `APP_ENV` : `development` | `preview` | `production`, lue uniquement via le module zod unique `src/lib/env.ts` (jamais `process.env` ailleurs, jamais `NEXT_PUBLIC_PLACEHOLDER_FRAMES` comme marqueur).

Défaut sûr si absente ou invalide (valeurs typées `absent` / `invalid` visibles sur `/api/health`, champ `appEnv`) :

| Usage | Comportement par défaut |
| --- | --- |
| Argent / sécurité (provider fake, simulateur) | **production** : fake refusé, `/fr/payment/simulate/[id]` → 404 |
| Indexation | **non-production** : `X-Robots-Tag: noindex, nofollow`, meta robots, `robots.txt` `Disallow: /` |

Règles :

- `PAYMENT_PROVIDER=fake` n'est accepté qu'avec `APP_ENV` explicite `development` ou `preview` (démarrage en production avec fake ⇒ échec).
- Seule une `production` explicite est indexable : `robots.txt` ouvre `Allow: /` + sitemap ; tout autre valeur (y compris absente/invalide) publie `Disallow: /` et noindex.
- **Build** : `npm run build:prod` et le job CI `content-strict` exigent `APP_ENV=production` dans le shell du build. Attention : Next.js n'injecte pas `.env.local` dans le processus qui lance le build — définir la variable dans le terminal ou le gestionnaire de secrets de l'hébergeur, pas seulement dans `.env.local`.
- **Dev local** : le serveur Next lit `.env.local` au démarrage. Une variable absente vaut `absent` ⇒ argent/sécurité en mode production ; pour le provider fake en local, mettre `APP_ENV=development` dans `.env.local`.

## URL publique et hostname (M9c)

Un seul hostname par environnement — ne jamais melanger `localhost` et
`127.0.0.1` (cookies de session host-only + controle CSRF sur l'origine).

| Environnement | URL publique | NEXT_PUBLIC_APP_URL |
| --- | --- | --- |
| Developpement local | http://localhost:3000 | http://localhost:3000 |
| Production | https://teekay.fit | https://teekay.fit |

- Local : `supabase/config.toml` fixe `site_url = "http://localhost:3000"`
  et `additional_redirect_urls = ["http://localhost:3000"]` (plus de
  127.0.0.1). Appliquer avec `supabase stop` puis `supabase start`.
- Bascule production : definir `NEXT_PUBLIC_APP_URL=https://teekay.fit`
  dans le gestionnaire de secrets de l'hebergeur, puis mettre a jour
  `site_url` / `additional_redirect_urls` du projet Supabase de production
  (dashboard). Aucune valeur secrete dans le depot.
- Le lien magique admin utilise `/fr/admin` comme destination de connexion
  (voir `docs/admin-auth.md`) ; la MFA est exigee juste apres.
- Build : `npm run check:bundles` apres `npm run build` echoue si une URL
  locale (127.0.0.1 / localhost) fuit dans `.next/static`. En dev explicite
  (`APP_ENV=development|preview`), l'occurrence est seulement avertie.
