# Premier administrateur — création et activation MFA

Procédure de bootstrap : créer le **premier** compte admin quand aucun
admin n'existe encore pour approuver (rôle attribué côté serveur, jamais
auto-attribuable — PRD §16). Les inscriptions publiques restent
**désactivées** : le compte est créé par l'API admin (service-role).

> **Secrets** : la clé `SUPABASE_SERVICE_ROLE_KEY` ne figure JAMAIS ici ni
> dans aucun fichier du dépôt. Elle vient du gestionnaire de secrets de
> l'environnement (voir `docs/environments.md`). Les valeurs ci-dessous
> sont des variables à remplacer, jamais des identifiants réels.

## Étape 1 — Créer le compte (service-role)

Depuis un poste d'administration de confiance (la clé service-role donne
tous les droits) :

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"'"$ADMIN_EMAIL"'","email_confirm":true}'
```

- `ADMIN_EMAIL` : l'adresse du coach (fournie à l'étape de configuration,
  jamais en dur dans le dépôt).
- **Pas de mot de passe** : la connexion se fait par lien unique (étape 3).
- Réponse : l'`id` (UUID) de l'utilisateur créé — à noter pour l'étape 2.

## Étape 2 — Accorder le rôle admin

```sql
insert into public.user_roles (user_id, role)
values ('<UUID_ÉTAPE_1>', 'admin');
```

Via `psql` (chaîne de connexion de l'environnement, gestionnaire de
secrets) ou via PostgREST avec la clé service-role. Vérification :

```sql
select public.is_admin();  -- exécuté AVEC la session de l'admin : true
```

## Étape 3 — Première connexion (lien unique)

1. Depuis la page de suivi d'une commande, ou en appelant
   `POST /api/auth/magic-link` avec `ADMIN_EMAIL` : un lien de connexion
   part par e-mail (limité en débit).
2. Cliquer le lien → page « Se connecter » → bouton (le lien est à usage
   unique, la consommation se fait en POST).

## Étape 4 — Activer le MFA (obligatoire avant toute action admin)

1. Ouvrir `/admin/mfa` (connecté) et suivre l'enrôlement TOTP :
   QR code → application d'authentification → code à 6 chiffres.
2. **Sauvegarder les 8 codes de secours hors ligne** (affichés une seule
   fois) avant de fermer la page.
3. Toute route `/api/admin/*` exige désormais la session aal2 (TOTP).

Procédure complète de récupération (téléphone perdu) :
voir `docs/admin-mfa-recovery.md`.

## Étape 5 — Règles permanentes

- **Deux admins minimum** recommandés (récupération mutuelle, voie 2 du
  document de récupération).
- Personne ne peut s'attribuer un rôle : l'attribution se fait UNIQUEMENT
  par cette procédure (service-role + SQL/PostgREST auditable).
- Chaque intervention service-role doit laisser une trace (entrée
  `audit_logs` ou note d'exploitation horodatée).
- Révocation d'un admin : `delete from public.user_roles where user_id = '<UUID>'`
  puis suppression du compte (`/auth/v1/admin/users/<UUID>`, service-role).
