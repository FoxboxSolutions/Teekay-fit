# MFA administrateur — activation et récupération

Authentification forte obligatoire pour les administrateurs (PRD §16). Facteur : **TOTP** (application d'authentification type Google Authenticator / Aegis).

## Activation

1. L'admin connecté appelle `POST /api/admin/mfa/enroll` (rôle admin requis, MFA pas encore actif).
2. La réponse contient le QR code, le secret et **8 codes de secours** — affichés **une seule fois**.
3. L'admin scanne le QR, saisit un code à 6 chiffres dans `POST /api/admin/mfa/verify`.
4. Le MFA passe en vérifié : toutes les routes `/api/admin/*` (hors activation MFA) exigent alors le TOTP.

**Obligation :** l'admin doit sauvegarder les 8 codes de secours hors ligne (coffre, impression) avant de fermer la page. Un code = usage unique.

## Si le téléphone est perdu (procédure de récupération)

Deux voies, pour qu'un téléphone perdu ne bloque jamais l'accès :

### Voie 1 — code de secours (l'admin garde sa session active)

1. `POST /api/admin/mfa/recovery` avec l'un des codes de secours.
2. Le code est consommé (hash comparé, usage unique), le facteur TOTP est retiré, l'action est écrite dans `audit_logs` (`mfa.recovery_code_used`).
3. L'admin se réactive immédiatement : `POST /api/admin/mfa/enroll` puis `verify` — **nouveaux codes générés** (les anciens sont révoqués par la suppression du compte lié).

### Voie 2 — second admin (session perdue ou plus aucun code)

1. Un **second admin** doté d'un MFA actif retire le facteur perdu côté serveur :
   - `supabase.auth.admin.unenrollFactors()` avec la clé service-role, **ou**
   - directement en base (service-role) : `delete from mfa_recovery_codes where user_id = '<uuid>'` puis retrait du facteur via l'API admin Supabase.
2. L'admin débloqué relance l'activation (voie 1, étape 3).

> **Cas unique admin + téléphone perdu + aucun code** : ouvrir une session avec le service-role (gestionnaire de secrets de l'hébergeur) pour exécuter la voie 2. Cette opération est **auditable** : toute intervention service-role doit laisser une entrée `audit_logs`.

## Exigences

- Le refus (403 `mfa_required`) est appliqué côté **serveur** — jamais seulement dans l'interface.
- Aucun code de secours en clair en base : SHA-256 uniquement (`mfa_recovery_codes`).
- Toutes les tentatives de vérification et de récupération sont limitées en débit.
- La suppression/restauration des facteurs est tracée dans `audit_logs` (ajout seul).
