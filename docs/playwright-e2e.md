# Tests E2E Playwright — configuration et exécution

## Pourquoi `workers: 1` est obligatoire

Les 6 tests E2E (`e2e/*.spec.ts`) partagent la **BASE LOCALE UNIQUE**
(conteneur Docker `supabase_db_Teekay-fit`, port 25432) :

- Le *global setup* (`e2e/global-setup.ts`) exécute `supabase db reset`
  avant chaque run — il remet la base à vide.
- Les tests écrivent réellement dans cette base (commandes, paiements,
  leads, outbox, MFA…).
- Un test peut voir les données écrites par un autre test qui tourne en
  parallèle, et deux resets concurrents corrompraient l'état de la base.

`playwright.config.ts` force donc `workers: 1` (exécution séquentielle).
**Ne passez pas en `workers > 1` tant qu'aucune base isolée par test n'est
mise en place** (point ouvert M9b).

## Lancement en local

```bash
npm run test:e2e
# ou, pour un fichier :
npx playwright test e2e/m7a-payment.spec.ts
```

Variables d'environnement nécessaires (déjà injectées par `webServer.env` dans
`playwright.config.ts`) :
- `APP_ENV=development`
- `PAYMENT_PROVIDER=fake` (fournisseur fictif, interdit en production)
- `MAILER_PROVIDER=capture` (aucun e-mail réel)
- `MAILER_CAPTURE_FILE` (lecture du vrai lien de connexion via JSONL)

## Intégration CI

Le workflow CI existe déjà (`.github/workflows/ci.yml`) avec trois jobs :

1. **quality** — `npm run lint`, `npm run typecheck`, `npm run check:pdfs` et
   `npx vitest run tests/rtl.test.ts tests/no-service-role-client.test.ts`
   (lint, typecheck, garde PDF, tests unitaires sans base) ;
2. **content-strict** — `node scripts/check-placeholders.mjs --strict`
   (contrôle des placeholders, routes, numéro WhatsApp et `APP_ENV`) ;
3. **rls** — démarre le stack Supabase local (`npx supabase start` +
   `npx supabase db reset`) puis exécute `npm test` avec les clés du stack
   local (tests RLS).

Les tests E2E Playwright ne tournent **PAS** encore en CI. L'ajout d'un job
e2e est un **point ouvert** : il doit être fait de façon **strictement
additive** (un nouveau job `e2e` qui exécute `npx playwright test`), sans
supprimer ni modifier aucune ligne existante du workflow. Ce job E2E aura
besoin de Docker (base locale Supabase) et de `next dev` (webServer intégré
à Playwright). Aucun secret de paiement réel ne doit être présent
(`PAYMENT_PROVIDER=fake`).
