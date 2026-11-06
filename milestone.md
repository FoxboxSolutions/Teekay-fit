# Milestones — TeekayFit

**Basé sur :** PRD — TeekayFit v1.1 · **Date :** créée le 27 octobre 2026 · **Statut :** plan de découpe produit/technique

**Règles de ce document :**
- Aucune estimation de durée ni de date : le PRD (§21) les réserve à l'équipe de développement.
- Respect strict du PRD : aucune fonctionnalité, prix, contenu ou qualification inventé.
- Chaque milestone est livrable et testable ; les critères d'acceptation sont tirés de la section 18 du PRD.
- Les offres marquées « à valider » dans le PRD (mini-programme gratuit, packs 3 mois, crédit Starter → coaching, parrainage) sont **optionnelles** : elles ne bloquent ni M12 ni le lancement.

---

## 1. Vue d'ensemble des phases

| Phase | Contenu (PRD §6) | Milestones |
| --- | --- | --- |
| **Phase 0** | Décisions business, statut légal, domaine, comptes développeur, choix du paiement | M1 |
| **Phase 1 — MVP web commercial** | Site public, offres, disciplines, quiz, FAQ, contact, tunnel de commande, paiement (direct ou manuel), livraison sécurisée des PDF, CRM, dashboard, notifications de base, pages légales, sécurité et sauvegardes | M2 → M11 |
| **Lancement** | Mise en production avec offres et contenus approuvés | M12 |
| **Phase 2 — Apps et suivi** | Android/iOS, portail client, questionnaire de suivi complet (le minimal est collecté dès la Phase 1), périodes de coaching, programmes assignés, séances, progression | M13 |
| **Phase 2b** | Version arabe avec RTL | Backlog |
| **Phase 3 — Croissance** | Blog et SEO, attribution, analytics avancés, relances | Backlog |

Les Phases 2 et 3 ne bloquent pas le lancement de la Phase 1 (PRD §6).

**Ordre de livraison appliqué (voir §5)** : M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10 → M11 → M12 → M13.
Paiement (M6, M7) et livraison des PDF sécurisés (M8) avant les fonctions de confort (M9, M10) ; repli manuel BaridiMob inclus (M7) ; apps mobiles (M13) seulement après le lancement de la Phase 1 (M12).

---

## 2. Milestones

### M1 — Décisions de Phase 0

**Objectif :** Trancher les décisions ouvertes (PRD §19) qui conditionnent le démarrage du développement, du paiement et de la mise en ligne, et réunir les contenus approuvés.

**Checklist :**
- [ ] Achat et DNS de `teekay.fit` confirmés, avec plan B si indisponible
- [ ] Statut légal du coach clarifié avec un juriste local (registre du commerce, auto-entrepreneur) et compte bancaire professionnel
- [ ] Choix du fournisseur de paiement tranché : SlickPay, Chargily Pay ou virement manuel seul ; éligibilité, frais, règlement, webhooks et remboursements confirmés auprès du fournisseur
- [ ] Inscription Apple Developer depuis l'Algérie vérifiée (avant tout développement iOS, PRD §12.4)
- [ ] Contenus approuvés par le coach réunis : nom public, biographies courte et longue, expérience, qualifications vérifiées, photos, réseaux, contacts
- [ ] PDF finaux du Starter obtenus (ou décision sur un extrait)
- [ ] Contenu précis des offres de coaching défini (§5) : fréquence des check-ins, délai de réponse WhatsApp, nombre de révisions, règle de date de début ; salle/lieu, durée d'une séance, réservation et annulation, entrée en salle
- [ ] Marge du présentiel calculée et tarifs des packs 3 mois fixés
- [ ] Politiques vérifiées avec juriste : conditions, confidentialité, annulation/remboursement (loi 18-07), âge minimum (défaut : 18 ans et plus, tant qu'aucun cadre mineurs n'est défini)
- [ ] Offres optionnelles (mini-programme gratuit, packs 3 mois, crédit Starter, parrainage) identifiées comme non bloquantes
- [ ] Comptes développeur et hébergement préparés (Google Play 25 $, Apple Developer 99 $/an si éligible)

**Livrables :** tableau des décisions tranchées avec justificatifs (facture domaine, réponse du fournisseur, avis juriste), contenu approuvé, PDF Starter.

**Critères d'acceptation (§18) :** la section 18 n'a pas d'objet sur cette phase ; la règle applicable est celle du PRD §4/§7 — aucune qualification, récompense, record, témoignage ou statistique inventé ; aucun contenu publié sans approbation du coach.

**Dépendances :** point d'entrée ; décisions ouvertes §19.

**Risques principaux (§20) :** exigences légales bloquant les paiements → valider statut avec juriste avant de percevoir en ligne ; domaine indisponible → plan B ; refus Apple Developer → lancer web et Android d'abord.

---

### M2 — Fondations techniques

**Objectif :** Mettre en place le squelette Next.js/TypeScript/Tailwind, les environnements Supabase séparés, le schéma de données Phase 1, l'authentification et les contrôles d'autorisation.

**Checklist :**
- [x] Squelette Next.js avec TypeScript, Tailwind CSS, composants accessibles
- [x] Environnements développement, préproduction et production séparés ; migrations pour tout changement de schéma
- [x] Schéma Phase 1 (§14) : `profiles`, rôles côté serveur uniquement, `offers`, `offer_files`, `leads`, `quiz_submissions`, `customers`, `orders`, `order_items`, `payments`, `payment_events`, `promo_codes`, `referrals`, `capacity_slots`, `receipts`, `consents`, `audit_logs`
- [x] Règles de modèle : identifiants uniques et stables, horodatages UTC affichés en heure locale, montants en entiers de DA, clés étrangères et index, politique de conservation/archivage/suppression définie
- [x] Authentification Supabase (lien magique par e-mail ou connexion par téléphone) ; rôles gérés uniquement côté serveur ; authentification forte pour les administrateurs
- [x] RLS plus contrôles d'autorisation côté serveur ; personne ne peut s'attribuer un rôle
- [x] Aucun texte en dur dans les composants : tout passe par un système de traduction (clés FR) — préparation RTL
- [x] Propriétés CSS logiques (`margin-inline-start`, `padding-inline`, etc.) au lieu des propriétés physiques — préparation RTL
- [x] Sécurité applicative : validation serveur de toutes les entrées, limitation de débit (authentification, leads, commande, paiement, quiz), protection CSRF, XSS, injection, IDOR, élévation de privilèges
- [x] Secrets jamais dans Git, jamais dans le code client, jamais dans les journaux ; gestionnaire de secrets de l'hébergeur ; aucune valeur secrète dans une variable `NEXT_PUBLIC_*`
- [x] Observabilité de base : suivi des erreurs, journaux structurés, surveillance de disponibilité
- [x] Sauvegardes de la base configurées (test de restauration en M11)

**Points ouverts (fin M2) :**
- [x] Tests RLS exécutés en local avec `supabase start` (Docker requis) — **traité** : CI GitHub Actions livrée (lint, typecheck, tests + job `supabase start`/`db reset`/RLS sur push et PR)
- [ ] Limitation de débit actuellement en mémoire par instance (`rate-limit.ts`) : à passer sur Redis/Postgres partagé dès que plusieurs instances servent l'app — **M6** (avant le tunnel de commande)
- [ ] Purges (`purge_expired_rate_limits`, questionnaire santé 24 mois) : fonctions prêtes mais à planifier (pg_cron ou cron hébergeur) — **M12**
- [ ] CSRF : vérification d'origine active seulement si `NEXT_PUBLIC_APP_URL` est défini en environnement — **M11** (checklist prod)
- [ ] Enrôlement MFA admin : routes prêtes (`/api/admin/mfa/*`) mais sans interface ni obligation — à imposer au dashboard — **M9**
- [x] Connexion téléphone — **décision tranchée** : lien magique e-mail = mode principal, téléphone **désactivé au lancement** (`AUTH_PHONE_ENABLED=false`) ; e-mail **obligatoire** à la commande — reporté en M4 (formulaire) et M6 (création du compte) ; **le PRD réexporté (palette « luxury red & black » sans or, e-mail obligatoire, téléphone désactivé) sera commité dans le dépôt** par le propriétaire
- [ ] Aucun test E2E navigateur (Playwright) ni anti-bot captcha sur les formulaires publics — **traité en M5** : Turnstile + honeypot + rate limit livrés, **1er Playwright E2E** (quiz → résultat → lead) livré ; reste le parcours de commande (**M6**) puis la suite complète (**M11**)
- [x] `npx supabase status -o env` utilisé par les tests arrête imgproxy/pooler du stack local — **traité côté CI** (le job expose les clés par variables d'environnement) ; sans impact fonctionnel

**Livrables :** dépôt initial, schéma migré, authentification fonctionnelle, environnements séparés, socle i18n/CSS logiques.

**Critères d'acceptation (§18 — Sécurité et administration) :** personne ne peut élever son propre rôle ; fondations RLS garantissant qu'un client ne lira jamais les données d'un autre.

**Dépendances :** M1 (domaine, choix fournisseur pour structurer `payments`).

**Risques principaux (§20) :** dérive du périmètre (prioriser la Phase 1) ; exposition de secrets → renouveler en cas d'exposition ; failles d'élévation de privilèges.

---

### M3 — Design system & kit de marque

**Objectif :** Déployer la direction visuelle « luxury red & black » issue du logo — palette, typographies, tokens et composants accessibles — et aligner le PRD sur cette direction.

**Checklist :**
- [x] Analyse du logo TeekayFit : monogramme « TK » avec silhouette d'aigle, mot-symbole « TEEKAY » blanc/texturé + « FIT » rouge, baseline « DISCIPLINE · AMBITION · BROTHERHOOD » (PNG 1254×1254 fond transparent ; rouge pur mesuré ≈ #B40000–#C10000, blanc pur #FFFFFF — écarts vs palette documentés plus bas)
- [x] Palette du design system « luxury red & black » (le logo fait foi, aucune couleur or) :
  - Fond principal : noir profond `#0A0A0A`
  - Surfaces : `#121212` et `#1A1A1A`
  - Bordures : `#2A2A2A`
  - Texte principal (titres, texte, prix) : blanc cassé `#F2EFEA`
  - Texte secondaire : gris chaud `#A8A29E`
  - Rouge luxe (fonds de bouton, badges, bandeaux) : `#A6111B`
  - Rouge vif (texte rouge, « FIT », liens, icônes et états actifs) : `#E8323B` — **texte : `#F6323B`** (ajustement minimal, voir ratios ci-dessous)
  - Bordeaux (survol, dégradés, bordures rouges) : `#7A0C13`
- [x] Règles d'usage : rouge rare — moins de 10 % de la surface d'une page, réservé aux CTA principaux, au mot « FIT », aux filets fins et aux états actifs ; prix toujours en blanc cassé, jamais en rouge ; interdit `#A6111B` en texte sur fond noir ; interdit texte rouge sur fond rouge ; aucun dégradé décoratif hors du rouge/bordeaux du hero ; contraste minimum 4,5:1 pour tout texte (règles publiées dans `/fr/design-system` + commentaire de `globals.css`)
- [x] Ajustement de contraste signalé : `#E8323B` échoue comme texte sur `#121212` (4,42:1) et `#1A1A1A` (4,10:1) ; teinte minimale retenue `#F6323B` (canal R +14, même teinte) — 5,13:1 / 4,85:1 / 4,51:1 sur les trois fonds ; `#E8323B` reste valable en texte sur `#0A0A0A` (4,67:1) et pour les éléments non textuels (icônes, filets, « FIT » : seuil 3:1 atteint partout) — verrouillé par `tests/contrast.test.ts`
- [x] Définir les tokens (variables CSS et configuration Tailwind) pour chaque couleur de la palette (thème Tailwind 4 `@theme` dans `globals.css` : couleurs, typographies, rayons, ombres, durées + familles ; source unique partagée avec `src/lib/design-system/palette.ts`)
- [x] Créer une page ou un document de référence du design system avec les couples texte/fond validés et leurs ratios de contraste (tableau ci-dessous) — page `/fr/design-system` (dev-only, 404 en production, `robots: noindex`), ratios recalculés en direct
- [x] Vérifier que le logo reste lisible sur `#0A0A0A` (affiché sur fond `#0A0A0A` dans la section logo de `/fr/design-system`)
- [x] Texture grunge réservée au logo et aux visuels hero, jamais au texte de l'interface ni aux composants (règle publiée dans `/fr/design-system`)
- [x] Typographies (§4) : une police condensée en gras pour les titres, une police sobre pour le texte — Barlow Condensed 600/700 + Inter variable, next/font auto-hébergé, latin + latin-ext, `display: swap`
- [x] Composants accessibles : navigation au clavier, focus visibles, libellés et erreurs de formulaire explicites, textes alternatifs, respect de « réduire les animations » (12 composants Radix, `Field` relie erreur via `aria-describedby`, icônes `aria-hidden`, `prefers-reduced-motion` global)
- [x] Direction premium, athlétique, minimale ; aucune animation excessive ; jamais de photos génériques, faux compteurs ou témoignages non vérifiés
- [x] Kit de marque minimal : monogramme, palette, typographies, modèles Instagram et stories cohérents (modèles Instagram/stories réalisés hors dépôt, comme convenu ; monogramme + lockup servis dans `public/`, favicons générés)
- [ ] **Mettre à jour le PRD §4** : remplacer « noir profond, blanc, or métallique discret » par : « premium, athlétique, minimale ; palette « luxury red & black » : noir profond `#0A0A0A` (fond), surfaces `#121212` et `#1A1A1A`, bordures `#2A2A2A`, texte principal blanc cassé `#F2EFEA`, texte secondaire gris chaud `#A8A29E`, rouge luxe `#A6111B` (fonds de bouton, badges, bandeaux), rouge vif `#E8323B` (« FIT », liens, icônes, états actifs ; texte rouge en `#F6323B` pour respecter 4,5:1), bordeaux `#7A0C13` (survol, dégradés) ; rouge limité à moins de 10 % de la surface d'une page ; aucune couleur or » — **RESTE OUVERT : le PRD actuel n'a pas été réexporté (contient encore « or métallique discret » et « e-mail (si utile) »), à appliquer de votre côté**
- [ ] Photos authentiques du coach uniquement (contenus validés en M1 — attendus en M1)

**Contrastes vérifiés (calcul WCAG réel, ratio = (L1 + 0,05) / (L2 + 0,05)) :**

| Couple texte / fond | Ratio | Verdict |
| --- | --- | --- |
| `#F2EFEA` sur `#0A0A0A` | 17,26:1 | ✓ |
| `#F2EFEA` sur `#121212` | 16,33:1 | ✓ |
| `#F2EFEA` sur `#1A1A1A` | 15,18:1 | ✓ |
| `#A8A29E` sur `#0A0A0A` | 7,85:1 | ✓ |
| `#A8A29E` sur `#121212` | 7,43:1 | ✓ |
| `#A8A29E` sur `#1A1A1A` | 6,90:1 | ✓ |
| `#F2EFEA` sur `#A6111B` (texte de bouton) | 6,74:1 | ✓ |
| `#F2EFEA` sur `#7A0C13` (survol de bouton) | 9,69:1 | ✓ |
| `#E8323B` sur `#0A0A0A` | 4,67:1 | ✓ |
| `#E8323B` sur `#121212` | 4,42:1 | ✗ texte → `#F6323B` |
| `#E8323B` sur `#1A1A1A` | 4,10:1 | ✗ texte → `#F6323B` |
| `#F6323B` sur `#0A0A0A` | 5,13:1 | ✓ |
| `#F6323B` sur `#121212` | 4,85:1 | ✓ |
| `#F6323B` sur `#1A1A1A` | 4,51:1 | ✓ |
| `#A6111B` sur `#0A0A0A` | 2,56:1 | ✗ interdit comme texte (confirmé par calcul) |
| `#E8323B` sur `#A6111B` | 1,82:1 | ✗ interdit : texte rouge sur fond rouge (confirmé par calcul) |

Éléments non textuels (icônes, filets, états actifs graphiques) : seuil WCAG 3:1 — `#E8323B` atteint 4,67:1 / 4,42:1 / 4,10:1 sur `#0A0A0A` / `#121212` / `#1A1A1A`.

**Livrables :** tokens du design system (couleurs, typographies, espacements), document de référence des couples texte/fond avec ratios, bibliothèque de composants UI, kit de marque, PRD §4 mis à jour.

**Critères d'acceptation (§18) :** aucun faux témoignage, certification ou statistique dans les visuels ; critères complémentaires §4 : contrastes suffisants (≥ 4,5:1 vérifiés par calcul), focus visibles, navigation au clavier.

**Dépendances :** direction « luxury red & black » tranchée (décision de cadrage : le logo fait foi) ; M1 (photos et contenus approuvés).

**Risques principaux :** divergences image entre PRD et design system si §4 n'est pas mis à jour ; texte rouge retombant sous 4,5:1 si l'ajustement `#F6323B` n'est pas appliqué sur les surfaces (atténuation : tokens de contraste vérifiés) ; dérive vers du grunge sur l'interface (atténuation : règle stricte logo/hero uniquement).

**Livré en M3 (commits) :**
- `0856808` — tokens (thème Tailwind 4 `@theme` : couleurs, typographies, rayons, ombres, durées) + `tests/contrast.test.ts` (30 assertions WCAG : ≥ 4,5:1 texte, ≥ 3:1 non textuel, paires interdites confirmées) ; palette CSS ↔ palette TS verrouillées ensemble
- `dc6d47e` — polices next/font auto-hébergées : Barlow Condensed 600/700 (titres) + Inter variable (texte), latin + latin-ext, `display: swap`, variables `--font-*`
- `1fd4f66` — composants de base : Button (primaire/secondaire/fantôme), Input, Textarea, Field (libellé + erreur reliée `aria-describedby`), Checkbox, Radio, Card, Badge ; cibles 44px ; utilitaires `duration-*` liés aux tokens
- `7a58c9f` — composants d'interaction : Select, Dialog (overlay plein écran en propriétés logiques), Toast, Tabs, Accordion (primitives Radix, aucun texte en dur, icônes `aria-hidden`)
- `3414283` — page `/fr/design-system` : dev-only (404 en production, `robots: noindex`), tokens, specimens typographiques, galerie de composants, tableau des contrastes calculé en direct, règles d'usage, logo sur `#0A0A0A`
- `9901129` — kit de marque : `src/app/icon.png` + `src/app/apple-icon.png` (monogramme TK : détection automatique de la frontière mot-symbole, bbox + canevas transparent), `public/logo-monogram.png`, `public/logo-full.png`

**Vérifications M3 :** 70 tests verts (dont 30 contraste + règle RTL stricte) ; lint et typecheck propres ; build OK ; accents É È À Ç Œ présents dans les `cmap` des woff2 livrés (contrôle automatique fonttools sur les fichiers du build) ; `/fr/design-system` = 200 en dev, 404 en production avec meta `noindex`.

**À demander au graphiste (livrables vectoriels manquants) :**
1. Monogramme TK isolé en SVG/PDF — le crop PNG actuel coupe la pointe de l'aile droite à la jonction avec le mot-symbole (y ≈ 805 sur 1254).
2. Lockup horizontal complet en vecteur (mot-symbole + baseline) pour en-tête et pied de page nets à toute taille.
3. Variantes de couleur : actuelle, blanc 100 %, noir 100 %, aplat `#A6111B`.
4. Version « propre » sans texture grunge (favicon ≤ 32 px, filigranes — la texture disparaît à petite taille).
5. Nom et licence de la police du mot-symbole (wordmark actuellement uniquement raster avec grunge).
6. Teinte exacte du rouge validée pour l'impression (PNG mesuré ≈ #B40000–#C10000 ; palette web : `#A6111B` fonds / `#F6323B` texte).

**Ouvert après M3 :**
- [ ] **Comparaison visuelle logo / rouge luxe** : à réaliser par le propriétaire sur `/fr/design-system` — **aucune modification de la palette sans son accord explicite** (les tokens `#A6111B` / `#F6323B` / `#E8323B` sont verrouillés par `tests/contrast.test.ts` et ne bougeront que sur décision).
- [ ] **PRD réexporté** : version alignée (palette luxury red & black, e-mail obligatoire, téléphone désactivé) à committer dans le dépôt — le fichier actuel garde encore « or métallique discret » et « e-mail (si utile) ».
- [ ] Photos du coach (attendues en M1) — dernier point de la checklist M3.
- [ ] Contrôle visuel en navigateur des accents en capitales sur `/fr/design-system` (cmap vérifié automatiquement, rendu à confirmer visuellement).

---

### M4 — Site public & pages d'offres

**Objectif :** Livrer le site public et le tunnel de vente : accueil, présentation du coach, offres configurables, pages par discipline, FAQ et contact.

**Checklist :**
- [x] Routes §7 : `/`, `/about`, `/coaching`, `/coaching/starter`, `/coaching/online`, `/coaching/in-person`, `/faq`, `/contact` livrées ; `/checkout/[offre]` = page « bientôt disponible » (comingSoon, hors M6) ; `/login` et `/register` hors périmètre M4 (compte créé au lancement via lien magique — **M6**)
- [x] Pages par discipline : `/disciplines/[hyrox|running|trail|boxe|musculation]`
- [x] Les 9 sections de l'accueil : hero (proposition de valeur placeholder, image d'attente + vidéo optionnelle, CTA WhatsApp), présentation du coach, disciplines, trois offres (prix/inclusions/places réelles), méthode, preuves (état vide honnête — rien publié), FAQ, appel à l'action final, pied de page (liens légaux ; réseaux masqués tant que non fournis)
- [x] Offres et prix lus depuis la base (`offers`, seed PRD §5) et configurables, jamais codés en dur ; affichage en DA blanc cassé
- [x] Inclusions, exclusions, durée et conditions visibles avant paiement ; mention « aucun résultat garanti » et « pas de renouvellement automatique » ; inclusions seed = jeton à faire relire par le coach (nutrition, qualification)
- [x] Places restantes : compteur réel (`capacity_slots`), masqué s'il n'y a pas de donnée (jamais de faux compteur)
- [x] WhatsApp canal principal : bouton fixe mobile, messages pré-remplis par offre (next-intl), numéro dans `NEXT_PUBLIC_WHATSAPP_NUMBER` (+213…, masqué si absent/incorrect) ; formulaire en canal secondaire ; aucune affirmation de livraison
- [x] Profil du coach : uniquement du contenu structuré — biographies/qualifications/expérience/photos/réseaux en placeholders (aucune qualification inventée)
- [x] Offres optionnelles (mini-programme, packs 3 mois, crédit Starter, parrainage) non seedées → masquées tant que décision non tranchée
- [x] Page de vente et questionnaire d'aptitude minimal (PAR-Q oui/non structuré, **jamais de texte libre de santé**) + décharge à accepter, intégrés à la page de vente, validation zod, **sans écriture en base (M6)**
- [ ] **E-mail obligatoire à la commande** (décision tranchée) : **M6** (création du compte + tunnel) — en M4, le formulaire de contact exige déjà l'e-mail ; le champ commande/login arrive en M6
- [x] Performance (§4) : next/image (WebP/AVIF), chargement différé, image d'attente hero, vidéo hero optionnelle (si fournie) ; rapport Lighthouse mobile fourni (non bloquant CI)
- [x] Mobile-first, navigation au clavier, focus visibles, textes alternatifs ; aucun texte en dur (i18n) et propriétés CSS logiques (garde RTL verte)
- [x] Titres et descriptions uniques par page, hiérarchie sémantique (un seul h1), métadonnées de base (SEO détaillé en M10)

**Livrables :** site public complet déployé en préproduction avec le contenu approuvé, pages par discipline, tunnel jusqu'à `/checkout/[offre]`.

**Critères d'acceptation (§18 — Site et offres) :** les trois offres affichent les bons prix et inclusions ; le site fonctionne sur mobile et ordinateur ; aucun faux témoignage, certification ou statistique.

**Dépendances :** M1 (domaine/DNS, contenus coach, contenus des offres de coaching, tarifs packs), M2, M3.

**Risques principaux (§20) :** attentes floues sur les offres → publier inclusions, délais de réponse, durée et annulation avant le paiement ; faux effet de preuve sociale ; performance dégradée sur les réseaux mobiles algériens.

**Livré (M4) :** accueil 9 sections + `/coaching` (comparateur) + `/coaching/[slug]` (3 offres seedées : Starter 2 000 DA paiement unique, Online 6 000 DA, In-person 10 000 DA, inclusions/exclusions/conditions, CTA checkout + WhatsApp, bloc PAR-Q) + `/disciplines/[slug]` (5) + `/about` + `/faq` + `/contact` + `/checkout/[offre]` (comingSoon) + `/legal/[slug]` (privacy/terms/refunds, placeholder juriste). Migration `20261029130000_offers_content.sql` (colonnes contenu + seed). `src/lib/{offers/queries.ts,whatsapp.ts,site/nav-data.ts}`, `src/i18n/navigation.ts`, composants site (header/footer/brand/whatsapp-bar/aptitude-form/contact-form/content-text), contrôle de contenu `scripts/check-placeholders.mjs` + registre/manifeste, job CI `content-strict`, `/api/health` dégradé si zéro offre.

**Vérifications (M4) :** `npm test` = **147/147** (10 fichiers : contrast, rtl, placeholders, aptitude-form [jsdom], rls, rls-visibility, rls-anon-whitelist, no-service-role-client, **offers-anon** [les 3 offres seedées lisibles en anon], **routes-static**). `npm run typecheck` et `npm run lint` verts. `npm run build` OK (30 pages prérendues ; mode warn). Toutes les routes §7 → 200 en dev et prod (`next start`). **Lighthouse mobile (accueil, serveur prod, throttling simulé) :** Perf 78 · A11y 96 · SEO 92 · Best-Practices 100 · FCP 0,82 s · LCP 4,84 s · TBT 0,23 s · CLS 0 · SI ~4,4 s. *LCP élevé = swap des polices auto-hébergées sous throttling simulé (FCP < 1 s ⇒ le contenu peint vite) ; non bloquant CI ; le vrai visuel hero optimisé (M1) améliorera la métrique.* Garde RTL verte (`end-0` corrigé).

**Ouverts (M4) :** (1) `build:prod` et le job CI `content-strict` sont **rouges par conception** tant que 34 placeholders restent — c'est le signal de contenu manquant. (2) Toute la page du coach, les 3 biographies, les inclusions (surtout nutrition), les 5 descriptions de discipline et tous les corps légaux sont à fournir (listés plus bas). (3) `/login` et `/register` arrivent en M6 (lien magique e-mail). (4) Le « e-mail obligatoire à la commande » (champ commande + login) s'applique en M6. (5) Si un LCP < 2,5 s est exigé un jour : précharger/optimiser les polices ou `font-display: optional` (arbitrage marque) + visuel hero compressé.

**Audit M4 (a–d) — livré :**
- **(a) strict placeholders/WhatsApp** : déjà livré — `scripts/check-placeholders.mjs --strict`, `build:prod` (package.json), job CI `content-strict`, `tests/placeholders.test.ts`.
- Re-pré-audit avant M7a (sorties complètes présentées en séance, complément commit `28ea35c`) : M4 confirmé — comingSoon gate live (`check-manifest.json` + `tests/placeholders.test.ts`, `tests/routes-static.test.ts`), WhatsApp +213 (`tests/placeholders.test.ts` L73/L100), pages /legal placeholders détectées (mécanisme livré ; contenu juriste reste ouvert), `getOffers` + `/api/health` (`tests/offers-health.test.ts`), fuite PAR-Q impossible (`tests/aptitude-form.test.tsx` + `tests/rls.test.ts` L292 restriction `aptitude_questionnaires`), noindex hors production (`src/proxy.ts` + `tests/indexing.test.ts` + `tests/env.test.ts`) ; complément sonde RLS live (matrice anon/A/admin sur les 8 tables M6 — écritures refusées conformément au design, écriture uniquement via RPC/service role) ; seul écart constaté : test méta noindex de `/fr/orders/status` manquant → complété `28ea35c`.
- **(b) observabilité offres** : partiel → corrigé — `getOffers` journalise (`offers.fetch_failed`/`fetch_exception`), `/api/health` passe en 503 degraded si zéro offre ou décompte inexploitable — `tests/offers-health.test.ts` (5 tests, client Supabase simulé), commit `555717d`.
- **(c) tests PAR-Q** : déjà livré — `tests/aptitude-form.test.tsx` (aucune écriture storage, pas d'appel réseau, aucune URL de paiement côté client).
- **(d) APP_ENV** : livré et **complété en séance** — module zod unique `src/lib/env.ts` (défaut sûr : argent/sécurité → production, indexation → noindex), tests `tests/env.test.ts` (5 cas × garde fake/simulateur/meta), `src/proxy.ts` (`X-Robots-Tag: noindex, nofollow` hors production), `src/app/robots.ts` (Disallow / ; production = Allow + sitemap), `src/app/sitemap.ts`, meta robots héritée (`layout.tsx`), `build:prod` + CI strict exigent `APP_ENV=production` explicite, `/api/health` expose `appEnv` — docs `.env.example` + `docs/environments.md#app_env`, commits `3a90bde`, `46cd791`, `93d1d47`. **Compléments (séance APP_ENV/audit) :** (1) garde fake au démarrage du processus — `src/lib/payments/loader.ts` (`assertPaymentProviderConfig`) appelé par le hook Next 16 `register()` de `src/instrumentation.ts` : `PAYMENT_PROVIDER=fake` + APP_ENV production/absente/invalide ⇒ le serveur refuse de démarrer (smoke vérifié : `next dev` exit 1) ; `tests/payment-provider-guard.test.ts` (12 tests, 5 cas), commit `4fe22a7`. (2) route `/fr/payment/simulate/[id]` — gate `paymentSimulateAllowed()` AVANT i18n/params (page `force-dynamic`, noindex), 200 seulement development/preview + fake, 404 (digest `NEXT_HTTP_ERROR_FALLBACK`) sinon ; `tests/payment-simulate-route.test.ts` (7 tests), smoke 200/404/exit-1 réel, commit `00c188e`. Base : `npm test` **298/298** (20 fichiers), typecheck/lint verts.
- **Écart repéré en cours d'audit :** le PAR-Q M4 expose q1–q6 alors que `aptitude_questionnaires` porte q1–q7 (`other_restriction`) — alignement à faire en **M6**.

---

### M5 — Quiz & capture de leads

**Objectif :** Livrer le quiz « Trouve ton programme », la création de leads avec consentement et le pipeline CRM de base (données et règles).

**Checklist :**
- [x] Routes `/quiz` et `/results` (page résultat : carte offre issue des preuves réelles seedées §5 ; jeton inconnu ou expiré ⇒ page neutre identique, `noindex`)
- [x] 6 questions : objectif, niveau, disponibilité, matériel ou salle, préférence (en ligne ou présentiel), budget indicatif (facultatif, bouton « Passer »)
- [x] Résultat recommandant une offre avec une explication courte (règles déterministes préférence+objectif+budget, repli Starter ; recalcul côté serveur à la soumission)
- [x] Lead créé avec consentement explicite (recontact + 18 ans requis ; marketing optionnel non pré-coché ; versions + horodatage en `consents`), source « quiz » ; fonction atomique `submit_lead` (SECURITY DEFINER, service role seul)
- [x] Bouton ouvrant WhatsApp avec message pré-rempli (offre recommandée, objectif) sur la page résultat
- [x] Formulaire de contact disponible en canal secondaire, avec consentement et source « contact » (message ajouté aux `notes`, jamais écrasé)
- [x] Modèle `leads` (§11) : champs, pipeline `new` → `contacted` → `interested` → `follow_up` → `converted` → `lost`, notes à accès restreint (RLS admin seul), dates ; doublons : `phone_norm` unique + `needs_review`, ancien nom jamais écrasé
- [x] Recherche par nom et téléphone ; filtres par statut, offre, source, relance — **modèle prêt** (index `phone_norm`, `status`, `source`, `needs_review`) ; l'interface de recherche/filtres est livrée avec le dashboard (**M9**)
- [x] Numéros normalisés pour la détection de doublons (E.164 DZ) ; fusion par revue humaine uniquement (jamais automatique) — détection + `needs_review` livrées ; l'interface de fusion est en **M9**
- [x] Limitation de débit sur quiz et leads (buckets IP HMAC-salés : 5/10 min quiz, 3/10 min contact, 30/10 min lecture résultat) ; aucune donnée stockée sans consentement (RPC refuse sans consentement obligatoire)
- [x] Anti-bot : Cloudflare Turnstile sur le formulaire de contact et le quiz, en plus de la limitation de débit — vérification serveur échec fermé, honeypot à réponse factice identique (aucune écriture), clés de test refusées hors localhost
- [x] Aucun message marketing sans consentement et base légale (marketing = version + horodatage tracés en `consents`, jamais pré-coché)
- [x] Événements `quiz_start`, `quiz_complete`, `submit_lead`, `whatsapp_click` (sans PII ; `/api/telemetry` toujours `ok` silencieux ; détail M10)

**Livrables :** quiz fonctionnel, table `leads` avec pipeline et consentements, capture de leads documentée.

**Critères d'acceptation (§18 — Site et offres) :** le quiz crée un lead et recommande une offre ; le bouton WhatsApp s'ouvre avec le bon message.

**Dépendances :** M2, M3, M4 (pages et CTA) ; décisions sur les offres optionnelles (non bloquantes).

**Risques principaux :** leads perdus si enregistrement non serveur ; consentement absent → illégalité (loi 18-07) ; doublons de leads (atténuation : normalisation + revue humaine).

**Livré (M5) :** migrations `20261030090000_m5_lead_quiz_schema.sql` (besoins revue, notes, phone_norm unique, consentements recontact/18+, jetons résultat), `20261030100000_m5_submit_lead.sql` + `20261030110000_m5_submit_lead_notes.sql` (RPC atomique 15 params, notes ajoutées jamais écrasées). Libs : `src/lib/phone.ts` (E.164 DZ), `src/lib/quiz/{schema,recommend,results}.ts` (zod, reco pure, jeton SHA-256 72 h), `src/lib/leads/{capture,guard}.ts` (CONSENT_VERSIONS, honeypot → rate limit → Turnstile), `src/lib/security/{turnstile,rate-limit}.ts` (siteverify échec fermé + hostname strict hors clés de test ; `ipRateLimitKey` HMAC sel d'env, toutes les routes migrées). Routes : `POST /api/quiz/submit`, `POST /api/contact`, `POST /api/telemetry` (toujours ok, sans PII). UI : `/fr/quiz` (wizard 6 questions, reprise sessionStorage sans PII, focus clavier, honeypot, 3 consentements), widget `turnstile.tsx` explicite, `/fr/results/[jeton]` (lecture serveur par hash, inconnu = expiré = page neutre identique, carte offre + WhatsApp serveur pré-rempli sans numéro, `noindex`), `contact-form.tsx` branché, `whatsapp-link.tsx` client tracé ; entrées nav bureau/mobile + CTA accueil. Commits : `63222b2` `dda7d30` `d438627` `83fa953` `307eb8f` `2b6b1d8` `4e1c466` `ff85d7d` `9b518bb` `9d3266e` `2fd78d6` `10fe715`.

**Vérifications (M5) :** `npm test` = **229/229** (15 fichiers : 26 normalisation téléphone + 19 quiz schema/reco + 45 M5 DB/routes/RLS dont doublons séquentiels **et concurrents** (1 seul lead), atomicité (réponses invalides ⇒ 0 lead/0 consentement orphelin), honeypot ⇒ succès factice + zéro écriture, anti-énumération (réponse identique numéro existant ou non), refus captcha échec fermé (jeton absent, siteverify injoignable), consentement manquant ⇒ 400 sans écriture, rate limit 6e → 429, RLS anon sans aucune donnée leads/submissions/consents + `submit_lead` révoquée de anon). **1er E2E Playwright** (`npm run test:e2e`, clés de test Turnstile, `next dev`) : quiz complet → `/fr/results/<jeton>` → lead + soumission + reco `online` vérifiés en base ; jeton inconnu ⇒ page neutre. `npm run typecheck` et `npm run lint` verts. Vérifié manuellement en psql : rollback transactionnel, doublon `needs_review` avec nom d'origine conservé, notes contact concaténées, jetons uniquement hachés, `rate_limit_counters` ne contient que des HMAC (jamais d'IP en clair).

**Ouverts (M5) :** (1) **Textes de consentement = placeholders juriste** (recontact, marketing, 18+, mentions des pages légales) — bloquant pour la production (loi 18-07) ; versions figées dans `CONSENT_VERSIONS` à incrémenter si les textes changent. (2) Remplacer les **clés de test Turnstile** par les clés réelles du domaine en production (le hostname strict est déjà actif hors clés de test). (3) Purge/conservation des leads non convertis : fonctions prêtes, planification **M12** (pg_cron). (4) Interface de recherche, filtres et fusion manuelle des doublons : **M9** (dashboard). (5) Rappel **M11** : suite E2E complète (parcours de commande dès **M6**) + re-mesure Lighthouse sur contenu réel et vrai 4G (décision ÉTAPE 1). (6) Événements : détail/conservation en **M10**.

---

### M6 — Commandes & couche de paiement

**Objectif :** Mettre en place la création de commande sécurisée côté serveur, les statuts commande/paiement et une couche fournisseur indépendante du fournisseur choisi.

**Checklist :**
- [x] Validation côté serveur de l'offre et du prix (jamais de confiance au prix envoyé par le navigateur) — RPC `create_order` : l'offre active et son prix viennent de la base (migration `20261103100000`).
- [x] Application des codes promo valides, calculée côté serveur (usage limité : date, quantité, offre ciblée) — fenêtre/actif/offre ciblée, plafond < 100 % (contrainte SQL), remise ≥ prix refusée, arrondi unique en entier DA, `max_uses` atomique (6 appels concurrents ⇒ 3 commandes, prouvé).
- [x] Commande avec identifiant unique et référence lisible — référence `TKF-AAMM-XXXX`, suffixe dans un alphabet réduit sans 0/O/1/I/L, unicité par réessai ; idempotence par en-tête `Idempotency-Key` + hash du contenu canonique (hash différent ⇒ HTTP 409).
- [x] Copie figée de l'offre, du prix, de la devise et des conditions enregistrée à chaque commande — table `order_items` (inclusions/conditions copiées), devise `DA`, paiements liés.
- [x] Statut commande `pending_payment` et paiement `pending` à la création ; prochaines étapes affichées — la page de suivi `/fr/orders/status?token=…` affiche référence, statut, montant, date (langage métier uniquement).
- [x] Informations collectées minimales : nom, téléphone, **e-mail obligatoire** (décision tranchée, remplace « si utile »), offre, informations d'onboarding nécessaires, acceptation des conditions (version et horodatage en `consents`), mode de paiement ; pour les coachings : questionnaire minimal (PAR-Q) et décharge acceptée (tracée en `consents`) — PAR-Q structuré (7 booléens, aucun texte libre, conservation 24 mois), drapeau « avis médical conseillé » calculé côté serveur, consentements `terms/privacy/refunds/(health_waiver)` versionnés (`ORDER_CONSENT_VERSIONS`, placeholders juriste).
- [ ] Création automatique du compte client après la commande : **lien magique par e-mail (mode principal et unique au lancement)** — la connexion téléphone reste désactivée (`AUTH_PHONE_ENABLED=false`) — **partiellement livré, poursuite en M9** : inscriptions publiques DÉSACTIVÉES (`config.toml`, création de compte via admin API), lien magique durci (rate limit IP **et e-mail haché HMAC salé**, réponse identique e-mail connu/inconnu). L'e-mail de création de compte attend le SMTP réel (point ouvert). Conformément au plan amendé, le lien magique n'est jamais envoyé à la création de commande.
- [x] Premier test Playwright du parcours de commande (page d'offre → formulaire → création de compte ; la suite E2E complète est en M11) — `e2e/order.spec.ts` : page offre → POST `/api/orders` (jeton de statut, prix Starter lu en base) → webhook signé HMAC → page de statut « Paiement confirmé » ; jeton invalide ⇒ page neutre identique (la création de compte pas encore — voir point ci-dessus).
- [x] Transitions de statuts (`pending_payment`, `paid`, `cancelled`, `refunded` / `pending`, `verifying`, `confirmed`, `failed`, `rejected`, `refunded`) gérées côté serveur et auditées — RPC unique `transition_payment` (migrations `20261103110000`), journal append-only `payment_transitions` (update/delete refusés, prouvé), transitions strictes + no-op idempotent, audit `capacity_exceeded`.
- [x] Un paiement en attente, échoué, rejeté ou annulé n'ouvre jamais d'accès (structure de droits prête) — entitlements ouverts UNIQUEMENT à `confirmed` (unique par order_item) ; confirmation sur commande annulée ⇒ statut inchangé, aucun droit, ni place (table + audité).
- [x] Couche fournisseur indépendante : création du paiement, vérification serveur, traitement des notifications authentifiées, enregistrement de la référence, gestion des cas échoué, annulé, retardé et dupliqué, réconciliation avec la commande — interface `PaymentProvider` (`createPayment`, `verifyWebhook` sur corps BRUT), implémentation `fake` (dev/preview uniquement, garde au démarrage du processus), fabrique `getPaymentProvider` : slickpay/chargily refusés explicitement tant que l'intégration n'existe pas (M7), `manual` = null (BaridiMob M7).
- [x] Webhooks signés vérifiés ; clés d'idempotence : aucune notification dupliquée ne crée de doublon de commande, de paiement, de droit d'accès ni de message — webhook `/api/payments/webhook/[provider]` (signature + tolérance d'horodatage 300 s, comparaison en temps constant), `payment_events(provider, provider_event_id)` unique (payload stocké = `{}`), double notification ⇒ no-op.
- [x] Montants en entiers de DA ; secrets côté serveur uniquement, jamais dans le navigateur ni les journaux — `total_da`/`discount_da` entiers ; remise % arrondie une seule fois (NUMERIC, jamais flottant), total final ≥ 1 DA ; secrets serveur (`PAYMENT_WEBHOOK_SECRET`, sel rate limit), aucun payload complet ni secret en log.
- [x] Règle d'activation d'un coaching = paiement confirmé **+ questionnaire minimal (PAR-Q) + décharge acceptée** (tranché, voir incohérence n° 6) — PAR-Q + décharge exigés à la création (refus P4005/P4006 sinon), droit ouvert uniquement à `confirmed`.
- [x] Limitation de débit sur commande et paiement ; protections CSRF et IDOR — commande : garde anti-abus (honeypot + Turnstile échec fermé + rate limit IP haché) **et rate limit par e-mail haché HMAC salé** (nouveau helper `emailRateLimitKey`, e-mail jamais en clair dans les compteurs) ; webhook : signature obligatoire ; lecture de statut : jeton ≥128 bits haché SHA-256, inconnu = expiré = page neutre identique (aucun IDOR — RLS orders refuse anon/authentifié, service role uniquement pour l'écriture).

**Livrables :** API de commande, tables `orders`, `order_items`, `payments`, `payment_events`, `promo_codes`, couche fournisseur abstraite.

**Critères d'acceptation (§18 — Commandes et paiements) :** le total est calculé côté serveur ; la commande conserve une copie figée ; les notifications dupliquées ne créent aucun doublon ; le client voit un statut de paiement exact.

**Dépendances :** M1 (choix du fournisseur ; statut légal pour tout paiement direct), M2, M4 (offres configurées).

**Risques principaux (§20) :** doublons de notifications de paiement → traitement idempotent ; passerelle indisponible → couche indépendante + repli BaridiMob (M7) ; fuite de secrets → gestionnaire de secrets.

**Livré (M6) :** migrations `20261103100000_m6_create_order.sql` (RPC transactionnelle : e-mail obligatoire P4001, client par e-mail — index unique partiel `customers_email_unique`, référence `TKF-AAMM-XXXX` alphabet réduit, idempotence via contrainte unique + hash de contenu P4096, promo P4008/P4010/P4102, présentiel P4007/P4090, PAR-Q P4005/P4006, consentements versionnés, paiement `pending` ; colonnes `orders.slot_date` + `orders.needs_admin_review`), `20261103110000_m6_transition_payment.sql` (RPC `transition_payment` point d'entrée UNIQUE : journal append-only toujours non-null, entitlements uniquement à `confirmed` et jamais sur annulé, places consommées atomiquement à la confirmation avec dépassement audité + drapeau admin, `order_status_by_token` lecture par jeton haché inconnu = expiré = absence, `renew_order_status_token`). Libs : `src/lib/payments/{provider,event-schema,fake,status-token,loader}.ts` (interface + zod, fake HMAC « ts.corps » tolérance 300 s temps constant, jeton 256 bits haché SHA-256 14 j, fabrique avec garde APP_ENV), `src/lib/mailer/mailer.ts` (interface i18n + CaptureMailer/NullMailer), `src/lib/orders/status.ts`. Routes : `POST /api/orders` (garde anti-abus + honeypot + Turnstile, rate limit IP puis e-mail haché HMAC, `Idempotency-Key` obligatoire, mapping neutre P4096→409 / P4090→400 / sinon `creation_refusee`, jeton de statut renvoyé UNE fois, référence provider attachée, confirmation neutre CaptureMailer) et `POST /api/payments/webhook/[provider]` (corps brut, 403 sans détail, dédoublonnage `payment_events` payload `{}`, paiement inconnu/montant contredit ⇒ `ignored` + audit). Page `/fr/orders/status` (server component, noindex, rate limit lecture 30/600 IP hachée, statuts métier uniquement, page neutre identique absent/inconnu/expiré) + namespace i18n `order.status` ; lien magique durci (signups publics désactivés, `emailRateLimitKey` HMAC salé, réponse identique connu/inconnu). Commits : `d82eb24` `706a53b` `0fc86c1` `8ccc97a` `e73fb6b` `0c3eb3f` `a09570c`.

**Vérifications (M6) :** `npm test` = **368/368** (26 fichiers) ; typecheck et lint verts. Preuves ciblées : `tests/m6-db-create-order.test.ts` (14 tests : rejeu idempotent sans re-consommer le promo, 6 appels concurrents `max_uses=3` ⇒ exactement 3, arrondi 1 955 × 10 % ⇒ 196 DA, refus promo épuisé/invalide/remise ≥ prix, séance pleine ⇒ « complet » sans consommation, PAR-Q + drapeau avis médical), `tests/m6-db-transitions.test.ts` (9 tests : no-op idempotent, journal append-only update/delete refusés, dépassement capacité ⇒ droit ouvert + audit `capacity_exceeded` + drapeau admin, confirmation sur commandé annulée ⇒ aucun droit ni place, jetons inconnu/expiré ⇒ absence identique, IDOR anon refusé, renouvellement), `tests/m6-payments-libs.test.ts` (14), `tests/m6-api-routes.test.ts` (15 : honeypot ⇒ succès sans écriture, rate limit IP/e-mail, mapping neutre sans détail SQL, rejeu sans nouveau jeton, webhook doublon/403/inconnu/montant contredit/audit), `tests/m6-order-status.test.ts` (5 : jeton brut jamais en base, `missing` invariant), `tests/m6-auth-magic-link.test.ts` (4 : réponse identique connu/inconnu, buckets sans e-mail en clair HMAC vérifié). **E2E Playwright 4/4** (order 2 + quiz 2, serveur `next dev`) : commande → webhook signé → statut « Paiement confirmé » ; jeton invalide ⇒ page neutre. Smoke M6 pré-E2E : webhook rejeté sans signature, doublon ⇒ `duplicate`, montant contredit ⇒ `ignored` non transitionné.

**Ouverts (M6) :** (1) **Expiration des commandes `pending_payment`** (libération des séances, qui restent ouvertes tant qu'aucune place n'est consommée à la création) : planifiée **M12** avec pg_cron. (2) **Réouverture d'une commande annulée arrivant avec un paiement confirmé** : le droit n'est ni ouvert ni confisqué (audité) — l'admin décide d'une réouverture manuelle ; flux d'annulation complet en **M9**. (3) **Politique de dépassement de places** en cas de surbooking (le droit est déjà ouvert automatiquement + `needs_admin_review`/audit) : à trancher avec le propriétaire. (4) **Avis médical recommandé** : drapeau seulement, jamais de diagnostic — lecture du PAR-Q par le coach en **M9** ; textes de consentement/décharge = **placeholders juriste** (`2026-11-03-placeholder-juriste`, à faire valider puis incrémenter les versions). (5) **SMTP Supabase** pour le domaine `teekay.fit` (SPF/DKIM/DMARC + textes d'e-mails à valider) — la confirmation de commande reste en CaptureMailer (test) jusqu'au M7 ; la désactivation des signups publics n'est appliquée qu'en config locale, à reproduire côté dashboard hébergé. (6) Le **faux fournisseur `fake`** est interdit en production par la garde de démarrage (exit 1) : vérifier la variable dans le gestionnaire de secrets au **M12**.

**Bilan de séance (M6) :** ① Étape 1 APP_ENV terminée (garde fake au démarrage, simulateur gated) et audit M4 confirmé sans écart. ② M6 : commande transactionnelle (`create_order`) et transitions auditées (`transition_payment`) livrées et prouvées, couche fournisseur abstraite + fake contraint dev/preview, codes promo (arrondi entier DA, `max_uses` atomique), places (dépassement audité), PAR-Q, idempotence, webhook signé. ③ Page de statut neutre par jeton haché ≥128 bits + lien magique durci (signups désactivés, aucun oracle de compte) + E2E Playwright complet. ④ Checklist M6 : 14/15 cochées ; restée ouverte la création du compte client après commande, qui attend le SMTP réel (poursuite M9, avec les points pg_cron, réouverture après annulation, politique de surbooking, avis médical juriste, SMTP teekay.fit SPF/DKIM/DMARC). ⑤ Aucun déploiement ; base de preuves : 368 tests unitaires + 4 E2E verts, typecheck/lint verts, 8 commits (`d82eb24` → `a09570c`).

---

### M7a — Paiement manuel BaridiMob + reçus (scindé, décision tranchée)

**Objectif :** Débloquer les produits uniquement après confirmation vérifiée côté serveur, avec le paiement manuel BaridiMob audité, la vérification admin protégée MFA et les reçus PDF.

**Décision de cadrage :** M7 est scindé — **M7a (manuel BaridiMob + reçus, maintenant)** et **M7b (intégration SlickPay/Chargily, après décision légale** via le statut juridique/marchand ; derrière l'interface `PaymentProvider` M6 existante, sans toucher aux routes).

**Checklist M7a :**
- [x] Instructions de paiement BaridiMob configurées par le propriétaire en base (table de paramètres éditable par admin — jamais en dur ni dans le dépôt), affichées avec la référence de commande à mettre en motif du virement ; le numéro de compte ne figure ni dans les journaux ni dans les événements — **Preuves :** `63e9343` migration `20261103120000_m7a_site_settings.sql` (RLS admin+aal2, `is_admin_aal2()`, P5001–P5004) + `src/lib/settings.ts` ; `tests/m7a-db-site-settings.test.ts` ; affichage motif = référence `tests/m7a-status-page.test.ts` (« pending non expiré ⇒ instructions BaridiMob (compte, motif = référence, montant) + formulaire ») ; aucun log de `baridimob.account` (grep `src/lib`).
- [x] Soumission de preuve par le client : référence de transaction (format validé) + capture optionnelle — images uniquement (jpeg/png/webp), taille maximale, EXIF supprimé, nom de fichier regénéré, stockage privé, lecture admin uniquement via lien signé court ; paiement → `verifying` via `transition_payment` — **Preuves :** `84f1e10` migration `20261103130000_m7a_payment_proofs.sql` (bucket privé 5 Mo) + `src/lib/payments/proof.ts` ; `tests/m7a-proof-lib.test.ts` (magie de fichier, repack webp EXIF retiré), `tests/m7a-proof-route.test.ts` (« type/taille invalide ⇒ refus », jeton = capacité, rate limit 10/600), `tests/m7a-db-proofs.test.ts` (RLS : un client ne lit jamais la capture d'un autre).
- [x] Contrôles anti-fraude : même référence de transaction sur deux commandes ⇒ drapeau visible à l'admin ; montant attendu affiché à côté de la preuve ; confirmation exige la saisie du montant reçu (montant différent ⇒ refusé ou marqué avec motif) — **Preuves :** `84f1e10` (drapeau `needs_admin_review` + audit `proof_duplicate_txn_ref`, réponse client neutre) ; `ffd3c9b` `tests/m7a-admin-payments-api.test.ts` (« montant différent (≠ attendu) ⇒ 400 montant_invalide, aucune transition ni audit ») ; drapeaux affichés `tests/m7a-admin-payments-page.test.ts` + liste GET (`duplicate`, `needsAdminReview`).
- [x] Vérification admin minimale `/admin/payments` : liste des paiements `verifying`, détail, confirmer/rejeter avec motif — rôle admin **ET session MFA vérifiée (aal2)** côté serveur ; chaque action dans `audit_logs` (acteur, motif, horodatage) ; aucune confirmation sans aal2 — **Preuves :** `ffd3c9b` routes GET/POST confirm/reject (`requireAdminAal2` en tête, transition via `transition_payment` acteur admin, audit `payment_confirm_admin`/`payment_reject_admin` avec motif) ; `tests/m7a-admin-payments-api.test.ts` (« sans aal2 ⇒ 403 — aucune confirmation accessible sans aal2 », « rejeu ⇒ unchanged, AUCUN audit en double ni double envoi ») ; page sans aal2 = invitation MFA, aucune liste `tests/m7a-admin-payments-page.test.ts`.
- [x] MFA (en M7a, décalé depuis M9) : enrôlement + défi TOTP avec affichage et téléchargement des codes de secours ; le reste du dashboard reste en M9 — **Preuves :** `bed7145` page `/admin/mfa` + `AdminMfaPanel` (QR, clé manuelle, codes affichés une fois + téléchargement .txt) ; `tests/m7a-admin-aal2-guard.test.ts` (8 — `getAuthenticatorAssuranceLevel` courant, `requireAdminAal2` strict) + `tests/m7a-admin-mfa-page.test.ts` (5) ; E2E TOTP réel `e2e/m7a-payment.spec.ts`.
- [x] À la confirmation : ouverture des entitlements (déjà en place), envoi du lien magique et du reçu via l'interface `Mailer` RÉELLE (fournisseur configurable par variables d'environnement, sans valeur en dur ; en dev/test CaptureMailer) ; envois idempotents ; rejet ⇒ message neutre avec marche à suivre — **Preuves :** `a0e4a75` migration `20261103140000_m7a_email_outbox.sql` (UNIQUE (payment_id, event_type)) + `src/lib/mailer/provider.ts` (MAILER_PROVIDER=capture/resend, absent ⇒ fail closed en prod-like) + `src/lib/payments/notify.ts` (réservation outbox avant envoi, NOUVEAU jeton via `renew_order_status_token`, rejet neutre sans jeton) ; `tests/m7a-notify.test.ts` (« rejeu ⇒ skipped_replay, AUCUN renew ni envoi »), `tests/m7a-mailer-provider.test.ts` (8), `tests/m7a-db-email-outbox.test.ts` (4).
- [x] Reçu PDF généré côté serveur depuis la copie figée de la commande (pas de recalcul) : numéro de commande, date, offre, montant, mode de paiement ; intitulé « REÇU » (pas « facture ») tant que le comptable n'a pas validé les mentions ; polices du design system ; téléchargeable depuis la page de statut (jeton) et l'espace client — **Preuves :** `13af84f` `pdfkit@0.20.2` exact + `src/lib/payments/receipt.ts` (copie figée orders+order_items+date transition, refus currency≠DA/statut≠paid) + route GET `/api/orders/[reference]/receipt` (jeton = capacité, 404 neutre, rate limit 20/600) ; `tests/m7a-receipt-lib.test.ts` (« chaque ligne est cohérente avec la copie figée »), `tests/m7a-receipt-route.test.ts`, `tests/m7a-db-receipt.test.ts` ; lien page de statut `tests/m7a-status-page.test.ts` (« paid ⇒ lien de téléchargement du reçu ») ; espace client complet en M9.
- [x] Fenêtre de paiement : durée de validité d'une commande `pending_payment` configurable, message clair au client ; expiration automatique reste en M12 (pg_cron) — **Preuves :** `63e9343` `payment_window_hours()` (défaut 48 h, P5004) + `a11c7d0` `tests/m7a-settings-window.test.ts` (4 — 47 h/49 h, fenêtre courte, fail-safe) ; `tests/m7a-status-page.test.ts` (« fenêtre expirée ⇒ message clair, AUCUN formulaire, AUCUN numéro de compte »).
- [x] Une capture d'écran ne suffit jamais comme preuve de paiement ; jamais de demande de mot de passe, PIN, OTP ou identifiants bancaires au client — **Preuves :** la capture est OPTIONNELLE (la référence de transaction suffit : `object_path` nullable, `tests/m7a-db-proofs.test.ts`) ; textes i18n `order.status.proof` (aucun champ sensible demandé — revue `messages/fr.json`) ; l'admin voit référence + montant attendu, jamais d'identifiants.
- [x] Paiement accessoire / vérification en cours : la page de statut (et l'e-mail de rejet neutralisé) affichent « paiement en cours de vérification », jamais un faux succès — **Preuves :** `a11c7d0` `tests/m7a-status-page.test.ts` (« verifying ⇒ statut affiché + texte clair, plus AUCUN formulaire ni numéro ») ; e-mail de rejet neutre `tests/m7a-notify.test.ts` (« aucune référence de transaction, aucun motif interne »).
- [x] Paiement arrivant après annulation : aucune ouverture automatique ; réouverture manuelle par l'admin avec audit — **Preuves :** machine à états M6 inchangée (`tests/m6-db-transitions.test.ts` « transitions refusées » — `cancelled → confirmed` impossible, seule la RPC service/admin écrit) ; le paiement ne peut sortir de `verifying` que par admin (bloc 4) ; réouverture manuelle = flux M9 (ouvert M6).
- [x] Scénarios testés : sans aal2 ⇒ refus ; référence dupliquée ⇒ signalée ; montant différent ⇒ refusé ; fichier/taille invalide ⇒ refusé ; EXIF supprimé ; un client ne lit jamais la capture d'un autre ; confirmation ⇒ droit ouvert une seule fois + e-mail une seule fois (rejeu) ; reçu cohérent avec la copie figée ; RLS étendue ; E2E Playwright commande → preuve → confirmation admin (MFA simulé) → statut confirmé — **Preuves :** suite vitest **479/479 (43 fichiers)** + E2E **5/5** dont `e2e/m7a-payment.spec.ts` (parcours réel : garde 403 sans aal2 → enrôlement/défi TOTP réel via `/api/admin/mfa/*` → liste avec montant attendu → confirm montant exact → rejeu « unchanged » → outbox 1 ligne `sent`, 1 seul audit → ancien lien caduc, nouveau lien « Paiement confirmé » → reçu `%PDF-`) ; commits `63e9343` → `84f1e10` → `bed7145` → `ffd3c9b` → `a0e4a75` → `13af84f` → `a11c7d0` (+ ce commit).

**Hors périmètre M7a :** intégration fournisseur réel (M7b), livraison des PDF achetés et filigrane (M8), dashboard complet (M9). Zoom communication WhatsApp pré-remplie (sans affirmation de livraison ni intégration officielle) : reportée explicitement au calendrier général (après M7b), ni dans M7a ni dans M7b.

**Points ouverts M7a :** (1) mentions légales du reçu (« REÇU » vs « facture ») à valider par le comptable — intitulé REÇU en attendant ; (2) fournisseur d'e-mail réel + DNS teekay.fit (SPF/DKIM/DMARC) ; (3) durée de vie des captures de preuve (conservation/suppression, juriste) ; (4) statut juridique pour M7b.

**Bilan M7a (7 blocs + E2E, commits `63e9343` → `a11c7d0`) :**
1. Paramètres propriétaire en base (instructions BaridiMob, fenêtre 48 h) + garde aal2 stricte (`requireAdminAal2`) : aucune action de confirmation accessible sans second facteur — 403 prouvé en vitest ET en E2E réel.
2. Preuves clients sûres : référence formatée + capture optionnelle (magie de fichier, EXIF retiré par ré-encodage sharp, stockage privé, lien signé 300 s), anti-fraude référence dupliquée drapeau + audit, transitions toujours via `transition_payment`.
3. Confirmation admin auditée (montant reçu exigé, ≠ ⇒ refus ; rejeu « unchanged » sans double audit) ; MFA TOTP avec codes de secours livré en M7a (page `/admin/mfa`).
4. Effets de confirmation idempotents : outbox `email_outbox` UNIQUE (payment_id, event_type) — e-mail UNE fois (nouveau jeton de suivi via `renew_order_status_token`), rejet neutre avec marche à suivre ; mailer configurable par env, fail closed sans config.
5. Reçu PDF (pdfkit 0.20.2, copie figée, intitulé REÇU, polices Barlow OFL) téléchargeable par jeton (404 neutre) ; page de statut complète (instructions, preuve, verifying, expirée, reçu) ; suite 479/479 + E2E 5/5.

### M7b — Intégration fournisseur réel (SlickPay/Chargily)

**Objectif :** Brancher la passerelle retenue derrière l'interface `PaymentProvider` (M6), sans changer les routes ni le noyau de transitions.

**Checklist M7b :**
- [ ] Intégration du fournisseur retenu (SlickPay : cartes CIB et Edahabia ; ou Chargily Pay) : création, vérification serveur, notifications authentifiées, référence, cas échoué/annulé/retardé/dupliqué, réconciliation
- [ ] Webhooks signés du fournisseur traités par l'abstraction existante (`verifyWebhook` sur corps brut, dédoublonnage `payment_events`)
- [ ] Dépendance : décision légale/statut du propriétaire (avis juriste M1) — bloquant, aucune date promise

---

### M8 — Livraison sécurisée des PDF & accès client minimal

**Objectif :** Livrer les fichiers uniquement après paiement confirmé, filigranés et strictement personnels, avec une page minimale « Mes commandes et mes PDF » accessible par le compte créé après la commande.

**Checklist :**
- [ ] Stockage privé (bucket `STORAGE_BUCKET_PRIVATE`), fichiers jamais publics
- [ ] PDF filigranés : chaque téléchargement tamponné au nom et au téléphone du client
- [ ] Liens signés à durée courte ; le droit d'accès est vérifié côté serveur avant de générer tout lien
- [ ] Droit valide requis ; un droit expiré ou absent → accès refusé
- [ ] Déblocage déclenché uniquement par une confirmation serveur (une seule fois)
- [ ] Page minimale « Mes commandes et mes PDF » : liste des commandes avec statut de paiement exact + téléchargements sécurisés
- [ ] Accès via le compte créé automatiquement après la commande (lien magique) — le portail complet (questionnaire, programmes, séances) reste en Phase 2 (M13)
- [ ] Un coaching ou une commande expirée/annulée n'est jamais présenté comme actif
- [ ] Test d'impossibilité d'accès en devinant une URL
- [ ] Notification « accès aux PDF » envoyée — idempotente
- [ ] Fichiers Starter déposés manuellement en stockage privé Supabase avec la ligne correspondante dans `offer_files` (tranché, incohérence n° 7) ; interface d'upload admin : M9
- [ ] Politique de conservation et de suppression appliquée (§14) ; aucune donnée de carte, PIN, OTP ou identifiant bancaire stockée

**Livrables :** bucket privé avec filigranage, page « Mes commandes et mes PDF », flux de téléchargement signé et vérifié serveur.

**Critères d'acceptation (§18 — Fichiers) :** fichiers privés, impossibles d'y accéder en devinant une URL ; droit valide requis pour générer un lien ; les liens expirent ; chaque PDF est filigrané.

**Dépendances :** M1 (PDF finaux du Starter), M2, M6, M7 (confirmation de paiement).

**Risques principaux (§20) :** PDF remis avant paiement vérifié → droits d'accès côté serveur, stockage privé ; partage des PDF achetés → filigrane par client, liens à durée courte.

---

### M9 — Dashboard coach/admin & journal d'audit

**Objectif :** Donner au coach un dashboard responsive (PWA) utilisable sur téléphone, alimenté uniquement par des données réelles, avec journal d'audit et rôles appliqués côté serveur.

**Checklist :**
- [ ] Route `/admin` réservée aux administrateurs explicitement autorisés ; permissions appliquées côté serveur et en base, pas seulement dans l'interface
- [ ] Vue d'ensemble : compteurs et revenus réels (revenu confirmé = paiements confirmés non remboursés)
- [ ] Leads : pipeline CRM, relances, leads issus du quiz, notes à accès restreint
- [ ] Clients : fiche et historique de commandes ; conversion en client sans doublon
- [ ] Commandes : statut, copie figée de l'offre, livraison
- [ ] Paiements : méthode, statut, références, vérification manuelle, historique d'audit
- [ ] Offres : descriptions, prix, disponibilité, inclusions, conditions, places restantes (prix jamais codés en dur côté client)
- [ ] Codes promo et parrainage (si décision tranchée — optionnel, non bloquant)
- [ ] Programmes : dépôt des PDF privés et lien avec les droits d'accès
- [ ] Paramètres : informations business, canaux de contact, instructions de paiement (BaridiMob), politiques
- [ ] Journal d'audit : actions sensibles et décisions (vérifications de paiement, remboursements, changements de rôle, changements de prix, codes promo, accès aux fonctions sensibles)
- [ ] Indicateurs : nouveaux leads, leads à relancer, taux de complétion du quiz, commandes du jour et du mois, commandes en attente de paiement, paiements à vérifier, conversion par offre — aucune donnée fictive en production, états vides indiqués clairement
- [ ] Export CSV réservé aux utilisateurs autorisés
- [ ] PWA installable, web responsive utilisable depuis un téléphone
- [ ] Module séances (planning du présentiel) : reporté en Phase 2 (M13), conforme au §10.9

**Livrables :** dashboard complet, journal d'audit, interface de dépôt des programmes, indicateurs réels.

**Critères d'acceptation (§18 — Sécurité et administration) :** les pages et API admin rejettent les utilisateurs non autorisés ; personne ne peut élever son propre rôle ; tableaux de bord alimentés uniquement par des données réelles ; actions critiques dans le journal d'audit.

**Dépendances :** M2, M5 (leads), M6 (commandes), M7 (paiements), M8 (livraison).

**Risques principaux (§20) :** fuite des données clients → RLS et autorisations serveur ; élévation de rôle → permissions en base ; métriques fictives → interdiction explicite (§10) ; notes CRM mal restreintes.

---

### M10 — Notifications, analytics, SEO & légal

**Objectif :** Compléter le périmètre de lancement : notifications transactionnelles idempotentes, événements analytiques, référencement et pages légales approuvées.

**Checklist :**
- [ ] E-mails : demande reçue, commande créée, instructions de paiement, paiement confirmé ou rejeté, accès aux PDF, reçu, début du coaching
- [ ] Notifications admin : nouveau lead, nouvelle commande, paiement à vérifier
- [ ] Toutes les notifications rejouables sans doublon (idempotentes)
- [ ] WhatsApp : lien ou message pré-rempli ; aucune affirmation de livraison sans intégration officielle
- [ ] Événements §17 : `view_offer`, `quiz_start`, `quiz_complete`, `whatsapp_click`, `submit_lead`, `start_checkout`, `create_order`, `payment_pending`, `payment_confirmed`, `download_program` (`app_install` en Phase 2)
- [ ] Aucun événement d'achat avant la confirmation serveur du paiement ; consentement respecté pour les traceurs publicitaires
- [ ] SEO : titres et descriptions uniques, hiérarchie sémantique, URL canoniques sur `teekay.fit`, sitemap, robots, images optimisées, métadonnées de partage, pages par discipline
- [ ] Pages `/legal/privacy`, `/legal/terms`, `/legal/refunds` exactes et approuvées par le propriétaire et le juriste
- [ ] Enregistrement des consentements (conditions avec version et horodatage, quiz, marketing) ; collecte limitée aux données nécessaires
- [ ] Contact dédié pour les demandes liées aux données ; durées de conservation et procédure de suppression affichées
- [ ] Âge minimum 18 ans et plus affiché par défaut, tant qu'aucun cadre mineurs n'est défini (coach + juriste)
- [ ] Liens légaux et réseaux sociaux en pied de page (M4)

**Livrables :** système de notifications (e-mail + admin), plan d'événements d'analytics, sitemap/robots/canoniques, trois pages légales.

**Critères d'acceptation (§18) :** les notifications dupliquées ne créent aucun doublon (revérifié bout en bout) ; aucun faux témoignage dans les contenus promotionnels ; §22 : les pages légales sont approuvées par le propriétaire.

**Dépendances :** M1 (politique légale et de remboursement, domaine), M4 à M8 (parcours à notifier et à tracer).

**Risques principaux (§20) :** faux événement d'achat avant confirmation ; messages marketing sans consentement ; non-conformité loi 18-07 → validation juriste (M1).

---

### M11 — Tests, durcissement & déploiement

**Objectif :** Valider sécurité, confidentialité, cas limites de paiement, usage mobile et sauvegardes avant mise en production.

**Checklist :**
- [ ] Tests d'autorisation et de confidentialité : un client ne lit jamais les données d'un autre ; pages et API admin rejettent les non autorisés
- [ ] Tests d'élévation de rôle, IDOR, CSRF, XSS, injection, vérification de signature des webhooks
- [ ] Tests des cas limites de paiement : échec, annulation, retard, notification dupliquée, doublon de commande, repli BaridiMob avec accès admin restreint
- [ ] Revérification : paiement en attente n'ouvre aucun accès ; confirmation ouvre le droit une seule fois ; liens PDF expirent ; PDF filigrané ; accès URL devinée impossible
- [ ] Tests d'usage mobile (mobile-first) et navigation au clavier, focus visibles, contrastes, libellés d'erreur
- [ ] Performance mobile : contenu principal affiché en moins de 2,5 s sur mobile (réseaux algériens)
- [ ] Sauvegardes de la base et test de restauration réalisés et documentés
- [ ] Suivi des erreurs, journaux structurés et surveillance de disponibilité actifs
- [ ] Revue secrets : rien en Git, rien côté client, rien dans les journaux
- [ ] Environnements dev/préprod/prod distincts, migrations à jour
- [ ] Tableaux de bord vérifiés sans aucune donnée fictive
- [ ] Tests E2E Playwright complets (le premier test du parcours de commande est livré dès M6) : navigation, commande, paiement, livraison, accès admin

**Livrables :** rapports de tests (sécurité, paiement, mobile), procédure de restauration validée, préproduction stabilisée.

**Critères d'acceptation (§18 — intégral) :** Site et offres ✓ · Commandes et paiements ✓ · Fichiers ✓ · Sécurité et administration (actions critiques auditées ; sauvegardes et procédure de restauration en place) ✓.

**Dépendances :** M2 à M10.

**Risques principaux (§20) :** PDF remis avant paiement (régression) ; doublons de notifications ; partage de PDF ; failles d'autorisation non détectées avant lancement.

---

### M12 — Lancement Phase 1

**Objectif :** Mettre en production `teekay.fit` avec domaine, HTTPS, offres et contenus approuvés, et faire valider le parcours complet par le propriétaire.

**Checklist :**
- [ ] Domaine, hébergement et HTTPS configurés (DNS de `teekay.fit`)
- [ ] Le propriétaire a approuvé textes, prix, inclusions, images et pages légales
- [ ] Le paiement retenu est testé, y compris les échecs et les notifications dupliquées
- [ ] Le virement manuel BaridiMob est documenté et testé avec un accès admin restreint
- [ ] PDF privés, filigranés et accessibles uniquement après confirmation (revérifié en production)
- [ ] CRM, commandes, paiements et dashboard utilisent des données réelles
- [ ] Tests d'autorisation et de confidentialité réussis
- [ ] Mises en page mobile et ordinateur validées ; performance mobile contrôlée
- [ ] Suivi des erreurs, sauvegardes et restauration configurés
- [ ] Le propriétaire a testé le parcours complet, de la page d'offre jusqu'à la livraison
- [ ] Âge minimum 18+ par défaut affiché ; offres optionnelles non tranchées masquées (non bloquantes)
- [ ] Décisions ouvertes restantes tracées dans le backlog, sans bloquer le lancement

**Livrables :** site en production, checklist de « terminé » (§22) remplie et signée par le propriétaire.

**Critères d'acceptation (§18 + §22) :** l'ensemble des critères de la section 18 vérifié en production + les huit points de la section 22 (approbation, domaine/HTTPS, paiement testé, PDF, données réelles, autorisations, mobile/performance, sauvegardes, parcours propriétaire).

**Dépendances :** M1 (toutes les décisions bloquantes), M2 à M11.

**Risques principaux (§20) :** dérive du périmètre → prioriser la Phase 1 ; exigences légales bloquant les paiements ; lancement avec contenu non approuvé.

---

### M13 — Phase 2 : applications & suivi client

**Objectif :** Livrer les applications Flutter Android/iOS, le portail client web complet et le suivi de coaching, sans aucun achat dans l'app iOS.

**Checklist :**

*Applications (Flutter, même projet Supabase : Auth, RLS, Storage privé, liens signés) :*
- [ ] Connexion (lien magique ou téléphone)
- [ ] Mes commandes et statuts de paiement
- [ ] Mes PDF, consultables hors-ligne
- [ ] Séance du jour, disponible hors-ligne (stockage local)
- [ ] Bibliothèque vidéo d'exercices et minuteur de repos
- [ ] Journal des séries et des charges avec courbes de progression
- [ ] Check-in hebdomadaire avec photos privées
- [ ] Réservation et annulation de séances en présentiel, avec rappels
- [ ] Contact du coach via WhatsApp
- [ ] Profil, préférences de notification et suppression du compte depuis l'app
- [ ] Notifications push FCM (Android) et APNs (iOS) : rappels de séance, check-in hebdomadaire, nouveau programme
- [ ] Liens profonds vers les offres et séances ; textes prêts pour l'arabe et le RTL ; versions minimales d'OS définies ; accessibilité ; suivi des plantages ; mise à jour forcée possible

*Règles des stores (§12.3) :*
- [ ] Aucun achat ni lien de paiement externe dans l'app iOS pour les contenus numériques et le coaching en ligne ; l'app est un espace client, les achats se font sur le web
- [ ] Le coaching en présentiel, consommé hors de l'app, se réserver sans achat intégré ; même conception appliquée sur Android
- [ ] Soumission de test et réponse de recours argumentée prévues (Apple juge au cas par cas)
- [ ] Fiches de confidentialité (Apple) et section Sécurité des données (Google Play) respectées
- [ ] Comptes développeurs au nom du titulaire réel (pas de prête-nom) ; Apple Developer vérifié en M1 — si impossible : Android et web d'abord (le web fonctionne en PWA sur iPhone)

*Portail client web et suivi :*
- [ ] Portail client web complet : commandes et statuts, accès aux PDF, questionnaire, dates de début et de fin du coaching, programmes et bilans, séances, contact du coach — uniquement ses propres données, coaching expiré jamais présenté comme actif
- [ ] Questionnaire de suivi complet (expérience, disciplines, disponibilités, équipement, objectifs détaillés, suivi) — le questionnaire minimal (type PAR-Q) et la décharge sont déjà collectés dès la Phase 1 (M4/M6) ; activation = paiement + questionnaire + décharge
- [ ] Données de santé : minimisation, accès restreint, durée de conservation définie, consentement requis ; aucune posologie de diagnostic
- [ ] Photos de progression privées (client et coach uniquement)
- [ ] Gestion des périodes de coaching, programmes assignés, séances en présentiel (côté client + module séances du dashboard), suivi de progression
- [ ] Modèle Phase 2 (§14) : `questionnaires`, `coaching_enrollments`, `assigned_programs`, `exercises`, `workout_logs`, `check_ins`, `sessions`, `bookings`, `progress_entries`, `device_tokens`, `notifications`, `account_deletion_requests`

**Livrables :** applications Android et iOS (ou Android seul si Apple reste bloqué), portail client web, questionnaire PAR-Q, module séances étendu, push configurés.

**Critères d'acceptation (§18 — Applications) :** aucun achat ni lien de paiement externe dans l'app iOS pour les contenus numériques ; suppression de compte disponible dans l'app ; la séance du jour et les PDF s'ouvrent hors-ligne ; les rappels de séance arrivent en push sur Android et iOS.

**Dépendances :** M12 (apps seulement après le lancement de la Phase 1), M1 (compte Apple Developer, statut légal), M7 et M8 (données commandes et PDF), décision §19 « inscription Apple Developer depuis l'Algérie » pour iOS.

**Risques principaux (§20) :** refus ou impossibilité d'inscription Apple Developer → vérifié en Phase 0, lancement web et Android d'abord ; rejet de l'app iOS pour paiement hors achat intégré → conception espace client sans achat ni lien externe, soumission de test ; données de santé exposées → minimisation, RLS, journaux d'audit, stockage privé ; attentes floues sur les offres de coaching → règles publiées avant paiement.

---

## 3. Backlog (au-delà de la Phase 1)

### Phase 2b — Arabe & RTL
- Version arabe avec RTL (PRD §6).
- Prérequis déjà couverts en Phase 1 (M2) : aucun texte en dur dans les composants (système de traduction), propriétés CSS logiques, architecture prête pour l'RTL.
- Aucun contenu arabe avant la Phase 2b.
- Décision ouverte : calendrier de l'arabe (§19).

### Phase 3 — Croissance
- Blog et SEO, attribution des campagnes, analytics avancés, relances automatisées, fonctions de suivi supplémentaires selon les besoins réels (PRD §6).
- Événement `app_install` et relances sous réserve de consentement.

---

## 4. Décisions bloquantes (PRD §19)

| Décision | À résoudre avant (PRD) | Milestone bloqué | Statut |
| --- | --- | --- | --- |
| Achat de `teekay.fit` et DNS (plan B si indisponible) | Phase 1 | M1, M4 (site), M10 (SEO/canoniques), M12 (lancement) | Reste ouvert |
| Statut légal du coach (registre du commerce, auto-entrepreneur) et compte bancaire professionnel | Paiement direct | M7 ; à défaut seul le BaridiMob manuel (M7) reste possible | Reste ouvert |
| Choix : SlickPay, Chargily Pay ou virement manuel seul | Phase 1 | M6 (couche fournisseur), M7 (intégration) | Reste ouvert |
| Inscription Apple Developer depuis l'Algérie | Développement iOS | M13 (iOS uniquement ; web et Android non bloqués) | Reste ouvert |
| Biographie, photos, qualifications et liens approuvés par le coach | Contenu du site | M1, M3 (photos), M4 (pages du coach) | Reste ouvert |
| PDF finaux du Starter | Lancement | M8 (livraison), M12 | Reste ouvert |
| Contenu précis des deux offres de coaching (§5) | Page de vente | M1, M4 | Reste ouvert |
| Marge du présentiel et tarifs des packs 3 mois | Page de vente | M1, M4 | Reste ouvert |
| Crédit Starter vers coaching, mini-programme gratuit, parrainage | Phase 1 | M5, M6 — **non bloquant** : optionnel, ne bloque ni M12 ni le lancement | Optionnel |
| Âge minimum et politique pour les mineurs | Lancement | M12 — **non bloquant** : défaut 18 ans et plus tant que coach et juriste n'ont pas défini un cadre | Tranché (défaut) |
| Politique légale et de remboursement | Lancement | M10, M12 | Reste ouvert |
| Calendrier de l'arabe | Phase 2b | Backlog Phase 2b | Reste ouvert |

**Urgences :** domaine + DNS (M4/M12), statut légal + choix du fournisseur (M6/M7), contenus du coach (M3/M4), PDF Starter (M8), politiques légales (M10/M12).

---

## 5. Ordre de livraison

Suite de la section 21 du PRD, sous les règles de priorisation ci-dessous.

1. **M1** — Décisions de Phase 0 (domaine, statut légal, fournisseur, Apple Developer, contenus)
2. **M2** — Fondations techniques (squelette, environnements, i18n/CSS logiques, migrations, auth)
3. **M3** — Design system & kit de marque (palette « luxury red & black », PRD §4 mis à jour)
4. **M4** — Site public & pages d'offres
5. **M5** — Quiz & capture de leads
6. **M6** — Commandes & couche de paiement
7. **M7** — Confirmation paiement & BaridiMob manuel + reçus
8. **M8** — Livraison sécurisée des PDF & accès client minimal
9. **M9** — Dashboard coach/admin & journal d'audit
10. **M10** — Notifications, analytics, SEO & légal
11. **M11** — Tests, durcissement & déploiement
12. **M12** — Lancement Phase 1
13. **M13** — Phase 2 : applications & suivi client

**Règles appliquées :**
- **Paiement et livraison des PDF avant les fonctions de confort** : M6, M7 et M8 (commandes, confirmation, livraison) précèdent M9 et M10 (dashboard complet, notifications avancées, SEO de croissance).
- **Repli manuel BaridiMob inclus** : M7 intègre le flux BaridiMob avec vérification admin auditée — indispensable tant que le fournisseur direct n'est pas sécurisé.
- **Apps mobiles seulement après la Phase 1** : M13 intervient uniquement après M12 (lancement), conformément au PRD §6 (les Phases 2 et 3 ne bloquent pas la Phase 1, et la Phase 1 les précède).
- Les délais restent fixés par l'équipe de développement après confirmation du paiement et du périmètre (PRD §21) ; aucune estimation n'est donnée ici.

---

## 6. Incohérences et ambiguïtés repérées dans le PRD

*Signalées sans correction du PRD, sauf mention explicite de décision de cadrage.*

| # | Point | Statut |
| --- | --- | --- |
| 1 | **Palette** : PRD §4 impose « noir profond, blanc, or métallique discret » alors que le logo utilise du **rouge** (aucun or visible). | **Tranché : « luxury red & black », or abandonné.** Palette finale : fond `#0A0A0A`, surfaces `#121212`/`#1A1A1A`, bordures `#2A2A2A`, texte `#F2EFEA`, secondaire `#A8A29E`, rouge luxe `#A6111B`, rouge vif `#E8323B` (texte : `#F6323B`, ajustement contraste documenté en M3), bordeaux `#7A0C13` ; rouge < 10 % de la surface ; prix en blanc cassé. Tâche M3 : mettre à jour le PRD §4 avec ce contenu. |
| 2 | **Orthographe du fournisseur** : « Slikpay » (v1.0) vs « SlickPay » (v1.1). | **Reste ouvert** : à confirmer auprès du fournisseur (M1). |
| 3 | **Espace client** : §9 indique « disponible sur le web et dans l'application (Phase 2) », alors que la livraison des PDF (§8) et son critère d'acceptation (§18) sont en Phase 1. | **Tranché** : page minimale « Mes commandes et mes PDF » dans M8 (accès par lien magique après commande) ; le portail complet reste en Phase 2 (M13). |
| 4 | **Offres « à valider »** : mini-programme gratuit, packs 3 mois, crédit Starter → coaching, parrainage (§5). | **Tranché pour la planification** : optionnels, non bloquants pour M12 et le lancement ; la décision business elle-même reste ouverte (§19). |
| 5 | **RTL** : §4 annonce l'architecture RTL « dès le départ » alors que l'arabe est livré en Phase 2b. | **Tranché** : Phase 1 = aucun texte en dur (système de traduction) + propriétés CSS logiques (tâches M2) ; contenu arabe uniquement en Phase 2b (backlog). |
| 6 | **Questionnaire et activation** : §5 impose « activation après paiement confirmé **et questionnaire** » pour les coachings, mais le questionnaire d'aptitude appartient à la Phase 2 (§6, §9) alors que les coachings sont vendus en Phase 1. | **Tranché (PRD v1.1)** : un questionnaire d'aptitude minimal (type PAR-Q : aptitude à l'effort, objectifs) et une décharge à accepter sont intégrés au parcours de commande dès la Phase 1 ; règle d'activation d'un coaching = paiement confirmé + questionnaire minimal + décharge acceptée (tâches M4 et M6). Le questionnaire de suivi complet reste en Phase 2 (M13). |
| 7 | **Ordre dépôt/livraison des PDF** : la séquence §21 place la livraison (étape 7) avant le dashboard (étape 8), alors que le dépôt des PDF privés vit dans le module « Programmes » du dashboard (§10.8). | **Tranché (PRD v1.1)** : au départ, dépôt manuel des PDF dans le stockage privé Supabase avec la ligne correspondante dans `offer_files` (M8) ; l'interface d'upload admin est livrée en M9. |
| 8 | **Âge minimum** : §16 demande une décision sans proposer de valeur. | **Tranché par défaut** : services réservés aux 18 ans et plus tant que le coach et un juriste n'ont pas défini un cadre pour les mineurs ; révisable. |
| 9 | **Calendrier de l'arabe** : décision ouverte §19 sans fenêtre définie. | **Reste ouvert** : ne bloque que le backlog Phase 2b. |
