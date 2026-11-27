# Connexion administrateur (lien magique) et MFA

Parcours livré (Option A) : `/fr/login` → e-mail → `/fr/auth/confirm` →
`/fr/admin` → **défi MFA obligatoire** (`/fr/admin/mfa`).

## 1. Destination de connexion : `/fr/admin`

`/fr/admin` est une **destination de connexion autorisée**. Après le POST
de `/api/auth/confirm` (session aal1), la garde `requireAdminAal2` rejoue :

- session absente ⇒ redirection vers `/fr/admin/mfa` (« Session requise ») ;
- session aal1 (admin) ⇒ redirection vers `/fr/admin/mfa` (défi TOTP) ;
- session aal2 ⇒ tableau de bord.

Aucun accès admin n'est donc ouvert par la seule connexion : **la MFA est
exigée juste après**, avant toute page ou route `/api/admin/*`.

## 2. Liste blanche `next`

`src/lib/auth/redirect-paths.ts` est la source unique :

```
/fr/admin     (connexion admin → défi MFA)
/fr/account   (espace client)
```

Tout le reste (URL absolue, `//host`, `\host`, valeur encodée, `..`,
casse différente, espace) retombe sur `/fr/account`. La page
`/fr/auth/confirm` valide `next` côté serveur avant de l'écrire dans le
formulaire, et la route POST le revalide (défense en profondeur).

## 3. Lien magique : token_hash à usage unique

1. `POST /api/auth/magic-link` `{ email, next }` ;
2. le serveur appelle `admin.generateLink` (service-role) et envoie le lien
   par **notre Mailer** — GoTrue n'envoie aucun e-mail ;
3. le lien pointe sur `/fr/auth/confirm?token_hash=…&type=magiclink&next=…` ;
4. le GET n'authentifie rien : un bouton POST consomme le `token_hash`
   (`verifyOtp`). Un scanner de liens ne peut pas consommer le jeton ;
5. **usage unique** : un second `verifyOtp` du même `token_hash` échoue
   (admin comme client), vérifié par un test d'intégration.

Réponse toujours neutre `{ ok: true }` (compte connu ou inconnu), latence
comparable, et **aucune création de compte** par cette route (les
inscriptions publiques restent désactivées).

## 4. Mailer local

`.env.local` (gitignoré) :

```
MAILER_PROVIDER=capture
MAILER_CAPTURE_FILE=test-results/mailer-capture.ndjson
```

Le lien est écrit dans le JSONL (secret d'usage unique, local, jamais
commité). **Inbucket reste à 0** : il ne reçoit que les e-mails de GoTrue ;
l'application envoie par `CaptureMailer` (local) ou Resend (production).
Ne jamais pointer l'application vers Inbucket sans changer explicitement
de transport SMTP.

## 5. Enrôlement / défi TOTP

- Aucun facteur vérifié ⇒ enrôlement (QR + clé + 8 codes de secours).
- Facteur vérifié + session aal1 ⇒ **défi** (`challengeAndVerify`) sur ce
  facteur, pas un nouvel enrôlement.
- Session aal2 ⇒ carte « active ».

## 6. Récupération

Voir `docs/admin-mfa-recovery.md` (codes de secours, téléphone perdu).
