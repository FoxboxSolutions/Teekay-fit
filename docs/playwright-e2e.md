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

Il n'existe pas encore de fichier de workflow GitHub Actions dans ce dépôt
(point ouvert M9b : ajouter `.github/workflows/ci.yml`). Lorsque la CI sera
créée, elle doit exécuter :

```yaml
- name: Tests unitaires
  run: npm test
- name: Tests E2E Playwright
  run: npm run test:e2e   # playwright.config.ts impose déjà workers: 1
```

Le job E2E a besoin de Docker (base locale Supabase) et de `next dev`
(webServer intégré à Playwright). Aucun secret de paiement réel ne doit être
présent (PAYMENT_PROVIDER=fake).
