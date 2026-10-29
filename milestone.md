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
- [ ] Squelette Next.js avec TypeScript, Tailwind CSS, composants accessibles
- [ ] Environnements développement, préproduction et production séparés ; migrations pour tout changement de schéma
- [ ] Schéma Phase 1 (§14) : `profiles`, rôles côté serveur uniquement, `offers`, `offer_files`, `leads`, `quiz_submissions`, `customers`, `orders`, `order_items`, `payments`, `payment_events`, `promo_codes`, `referrals`, `capacity_slots`, `receipts`, `consents`, `audit_logs`
- [ ] Règles de modèle : identifiants uniques et stables, horodatages UTC affichés en heure locale, montants en entiers de DA, clés étrangères et index, politique de conservation/archivage/suppression définie
- [ ] Authentification Supabase (lien magique par e-mail ou connexion par téléphone) ; rôles gérés uniquement côté serveur ; authentification forte pour les administrateurs
- [ ] RLS plus contrôles d'autorisation côté serveur ; personne ne peut s'attribuer un rôle
- [ ] Aucun texte en dur dans les composants : tout passe par un système de traduction (clés FR) — préparation RTL
- [ ] Propriétés CSS logiques (`margin-inline-start`, `padding-inline`, etc.) au lieu des propriétés physiques — préparation RTL
- [ ] Sécurité applicative : validation serveur de toutes les entrées, limitation de débit (authentification, leads, commande, paiement, quiz), protection CSRF, XSS, injection, IDOR, élévation de privilèges
- [ ] Secrets jamais dans Git, jamais dans le code client, jamais dans les journaux ; gestionnaire de secrets de l'hébergeur ; aucune valeur secrète dans une variable `NEXT_PUBLIC_*`
- [ ] Observabilité de base : suivi des erreurs, journaux structurés, surveillance de disponibilité
- [ ] Sauvegardes de la base configurées (test de restauration en M11)

**Livrables :** dépôt initial, schéma migré, authentification fonctionnelle, environnements séparés, socle i18n/CSS logiques.

**Critères d'acceptation (§18 — Sécurité et administration) :** personne ne peut élever son propre rôle ; fondations RLS garantissant qu'un client ne lira jamais les données d'un autre.

**Dépendances :** M1 (domaine, choix fournisseur pour structurer `payments`).

**Risques principaux (§20) :** dérive du périmètre (prioriser la Phase 1) ; exposition de secrets → renouveler en cas d'exposition ; failles d'élévation de privilèges.

---

### M3 — Design system & kit de marque

**Objectif :** Déployer la direction visuelle « luxury red & black » issue du logo — palette, typographies, tokens et composants accessibles — et aligner le PRD sur cette direction.

**Checklist :**
- [ ] Analyse du logo TeekayFit : monogramme « TK » avec silhouette d'aigle, mot-symbole « TEEKAY » blanc/texturé + « FIT » rouge, baseline « DISCIPLINE · AMBITION · BROTHERHOOD »
- [ ] Palette du design system « luxury red & black » (le logo fait foi, aucune couleur or) :
  - Fond principal : noir profond `#0A0A0A`
  - Surfaces : `#121212` et `#1A1A1A`
  - Bordures : `#2A2A2A`
  - Texte principal (titres, texte, prix) : blanc cassé `#F2EFEA`
  - Texte secondaire : gris chaud `#A8A29E`
  - Rouge luxe (fonds de bouton, badges, bandeaux) : `#A6111B`
  - Rouge vif (texte rouge, « FIT », liens, icônes et états actifs) : `#E8323B` — **texte : `#F6323B`** (ajustement minimal, voir ratios ci-dessous)
  - Bordeaux (survol, dégradés, bordures rouges) : `#7A0C13`
- [ ] Règles d'usage : rouge rare — moins de 10 % de la surface d'une page, réservé aux CTA principaux, au mot « FIT », aux filets fins et aux états actifs ; prix toujours en blanc cassé, jamais en rouge ; interdit `#A6111B` en texte sur fond noir ; interdit texte rouge sur fond rouge ; aucun dégradé décoratif hors du rouge/bordeaux du hero ; contraste minimum 4,5:1 pour tout texte
- [ ] Ajustement de contraste signalé : `#E8323B` échoue comme texte sur `#121212` (4,42:1) et `#1A1A1A` (4,10:1) ; teinte minimale retenue `#F6323B` (canal R +14, même teinte) — 5,13:1 / 4,85:1 / 4,51:1 sur les trois fonds ; `#E8323B` reste valable en texte sur `#0A0A0A` (4,67:1) et pour les éléments non textuels (icônes, filets, « FIT » : seuil 3:1 atteint partout)
- [ ] Définir les tokens (variables CSS et configuration Tailwind) pour chaque couleur de la palette
- [ ] Créer une page ou un document de référence du design system avec les couples texte/fond validés et leurs ratios de contraste (tableau ci-dessous)
- [ ] Vérifier que le logo reste lisible sur `#0A0A0A`
- [ ] Texture grunge réservée au logo et aux visuels hero, jamais au texte de l'interface ni aux composants
- [ ] Typographies (§4) : une police condensée en gras pour les titres, une police sobre pour le texte
- [ ] Composants accessibles : navigation au clavier, focus visibles, libellés et erreurs de formulaire explicites, textes alternatifs, respect de « réduire les animations »
- [ ] Direction premium, athlétique, minimale ; aucune animation excessive ; jamais de photos génériques, faux compteurs ou témoignages non vérifiés
- [ ] Kit de marque minimal : monogramme, palette, typographies, modèles Instagram et stories cohérents
- [ ] **Mettre à jour le PRD §4** : remplacer « noir profond, blanc, or métallique discret » par : « premium, athlétique, minimale ; palette « luxury red & black » : noir profond `#0A0A0A` (fond), surfaces `#121212` et `#1A1A1A`, bordures `#2A2A2A`, texte principal blanc cassé `#F2EFEA`, texte secondaire gris chaud `#A8A29E`, rouge luxe `#A6111B` (fonds de bouton, badges, bandeaux), rouge vif `#E8323B` (« FIT », liens, icônes, états actifs ; texte rouge en `#F6323B` pour respecter 4,5:1), bordeaux `#7A0C13` (survol, dégradés) ; rouge limité à moins de 10 % de la surface d'une page ; aucune couleur or »
- [ ] Photos authentiques du coach uniquement (contenus validés en M1)

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

---

### M4 — Site public & pages d'offres

**Objectif :** Livrer le site public et le tunnel de vente : accueil, présentation du coach, offres configurables, pages par discipline, FAQ et contact.

**Checklist :**
- [ ] Routes §7 : `/`, `/about`, `/coaching`, `/coaching/starter`, `/coaching/online`, `/coaching/in-person`, `/faq`, `/contact`, `/login`, `/register`
- [ ] Pages par discipline : `/disciplines/[hyrox|running|trail|boxe|musculation]`
- [ ] Les 9 sections de l'accueil : hero (proposition de valeur, vidéo courte, CTA WhatsApp), présentation du coach, disciplines (formulation approuvée), trois offres avec prix, inclusions et places restantes réelles, méthode, preuves authentiques (uniquement si existantes et autorisées), FAQ, appel à l'action final, pied de page avec liens légaux et réseaux
- [ ] Offres et prix lus depuis la base et configurables depuis le dashboard, jamais codés en dur ; affichage en DA
- [ ] Inclusions, exclusions, durée et conditions visibles avant le paiement ; aucune promesse de résultat garanti ; pas de renouvellement automatique
- [ ] Places restantes : compteur réel et configurable par le coach, jamais un faux compteur
- [ ] WhatsApp comme canal principal : bouton fixe sur mobile, message pré-rempli adapté à chaque offre ; formulaire en canal secondaire ; aucune affirmation de livraison d'un message WhatsApp sans intégration officielle
- [ ] Profil du coach avec uniquement le contenu fourni et approuvé (aucune qualification inventée)
- [ ] Offres optionnelles affichées uniquement si leur décision est tranchée ; sinon masquées (non bloquant)
- [ ] Page de vente et formulaire de commande des coachings : questionnaire d'aptitude minimal (type PAR-Q : aptitude à l'effort, objectifs) et décharge à accepter intégrés au parcours (Phase 1, PRD §5/§9)
- [ ] Performance (§4) : images WebP/AVIF avec image d'attente, chargement différé, vidéo hero courte (10 à 15 s) optimisée, contenu principal affiché en moins de 2,5 s sur mobile
- [ ] Mobile-first, navigation au clavier, focus visibles, textes alternatifs ; aucun texte en dur (i18n) et propriétés CSS logiques
- [ ] Titres et descriptions uniques, hiérarchie sémantique, métadonnées de partage (détail SEO en M10)

**Livrables :** site public complet déployé en préproduction avec le contenu approuvé, pages par discipline, tunnel jusqu'à `/checkout/[offre]`.

**Critères d'acceptation (§18 — Site et offres) :** les trois offres affichent les bons prix et inclusions ; le site fonctionne sur mobile et ordinateur ; aucun faux témoignage, certification ou statistique.

**Dépendances :** M1 (domaine/DNS, contenus coach, contenus des offres de coaching, tarifs packs), M2, M3.

**Risques principaux (§20) :** attentes floues sur les offres → publier inclusions, délais de réponse, durée et annulation avant le paiement ; faux effet de preuve sociale ; performance dégradée sur les réseaux mobiles algériens.

---

### M5 — Quiz & capture de leads

**Objectif :** Livrer le quiz « Trouve ton programme », la création de leads avec consentement et le pipeline CRM de base (données et règles).

**Checklist :**
- [ ] Routes `/quiz` et `/results` (page résultat uniquement avec preuves réelles et autorisées)
- [ ] 5 à 6 questions : objectif, niveau, disponibilité, matériel ou salle, préférence (en ligne ou présentiel), budget indicatif
- [ ] Résultat recommandant une offre avec une explication courte
- [ ] Lead créé avec consentement explicite, source « quiz »
- [ ] Bouton ouvrant WhatsApp avec message pré-rempli (offre recommandée, objectif)
- [ ] Formulaire de contact disponible en canal secondaire, avec consentement et source
- [ ] Modèle `leads` (§11) : champs, pipeline `new`, `contacted`, `interested`, `follow_up`, `converted`, `lost`, notes à accès restreint, dates
- [ ] Recherche par nom et téléphone ; filtres par statut, offre, source, relance
- [ ] Numéros normalisés pour la détection de doublons ; fusion par revue humaine uniquement
- [ ] Limitation de débit sur quiz et leads ; aucune donnée stockée sans consentement
- [ ] Aucun message marketing sans consentement et base légale
- [ ] Événements `quiz_start`, `quiz_complete`, `submit_lead`, `whatsapp_click` (détail en M10)

**Livrables :** quiz fonctionnel, table `leads` avec pipeline et consentements, capture de leads documentée.

**Critères d'acceptation (§18 — Site et offres) :** le quiz crée un lead et recommande une offre ; le bouton WhatsApp s'ouvre avec le bon message.

**Dépendances :** M2, M3, M4 (pages et CTA) ; décisions sur les offres optionnelles (non bloquantes).

**Risques principaux :** leads perdus si enregistrement non serveur ; consentement absent → illégalité (loi 18-07) ; doublons de leads (atténuation : normalisation + revue humaine).

---

### M6 — Commandes & couche de paiement

**Objectif :** Mettre en place la création de commande sécurisée côté serveur, les statuts commande/paiement et une couche fournisseur indépendante du fournisseur choisi.

**Checklist :**
- [ ] Validation côté serveur de l'offre et du prix (jamais de confiance au prix envoyé par le navigateur)
- [ ] Application des codes promo valides, calculée côté serveur (usage limité : date, quantité, offre ciblée)
- [ ] Commande avec identifiant unique et référence lisible (ex. `TKF-2610-0042`)
- [ ] Copie figée de l'offre, du prix, de la devise et des conditions enregistrée à chaque commande
- [ ] Statut commande `pending_payment` et paiement `pending` à la création ; prochaines étapes affichées
- [ ] Informations collectées minimales : nom, téléphone, e-mail si utile, offre, informations d'onboarding nécessaires, acceptation des conditions (version et horodatage en `consents`), mode de paiement ; pour les coachings : questionnaire minimal (PAR-Q) et décharge acceptée (tracée en `consents`)
- [ ] Création automatique du compte client après la commande (lien magique par e-mail ou connexion par téléphone)
- [ ] Transitions de statuts (`pending_payment`, `paid`, `cancelled`, `refunded` / `pending`, `verifying`, `confirmed`, `failed`, `rejected`, `refunded`) gérées côté serveur et auditées
- [ ] Un paiement en attente, échoué, rejeté ou annulé n'ouvre jamais d'accès (structure de droits prête)
- [ ] Couche fournisseur indépendante : création du paiement, vérification serveur, traitement des notifications authentifiées, enregistrement de la référence, gestion des cas échoué, annulé, retardé et dupliqué, réconciliation avec la commande
- [ ] Webhooks signés vérifiés ; clés d'idempotence : aucune notification dupliquée ne crée de doublon de commande, de paiement, de droit d'accès ni de message
- [ ] Montants en entiers de DA ; secrets côté serveur uniquement, jamais dans le navigateur ni les journaux
- [ ] Règle d'activation d'un coaching = paiement confirmé **+ questionnaire minimal (PAR-Q) + décharge acceptée** (tranché, voir incohérence n° 6)
- [ ] Limitation de débit sur commande et paiement ; protections CSRF et IDOR

**Livrables :** API de commande, tables `orders`, `order_items`, `payments`, `payment_events`, `promo_codes`, couche fournisseur abstraite.

**Critères d'acceptation (§18 — Commandes et paiements) :** le total est calculé côté serveur ; la commande conserve une copie figée ; les notifications dupliquées ne créent aucun doublon ; le client voit un statut de paiement exact.

**Dépendances :** M1 (choix du fournisseur ; statut légal pour tout paiement direct), M2, M4 (offres configurées).

**Risques principaux (§20) :** doublons de notifications de paiement → traitement idempotent ; passerelle indisponible → couche indépendante + repli BaridiMob (M7) ; fuite de secrets → gestionnaire de secrets.

---

### M7 — Confirmation paiement & BaridiMob manuel

**Objectif :** Débloquer les produits uniquement après confirmation vérifiée côté serveur, avec le fournisseur retenu et le repli manuel BaridiMob audité, et émettre les reçus.

**Checklist :**
- [ ] Intégration du fournisseur retenu (SlickPay : cartes CIB et Edahabia ; ou Chargily Pay) : création, vérification serveur, notifications authentifiées, référence, cas échoué/annulé/retardé/dupliqué, réconciliation
- [ ] Seule une confirmation vérifiée côté serveur déclenche la livraison, une seule fois
- [ ] Repli manuel BaridiMob : instructions de paiement configurées par le propriétaire avec la référence de commande unique à mettre en motif du virement
- [ ] Saisie de la référence de transaction et, si besoin, capture du reçu → passage en `verifying`
- [ ] Un administrateur autorisé vérifie les fonds via le canal officiel, puis confirme ou rejette (administrateur, horodatage et motif enregistrés dans `audit_logs`)
- [ ] Une capture d'écran ne suffit pas comme preuve ; jamais de demande de mot de passe, PIN, OTP ou identifiants bancaires
- [ ] Si la confirmation tarde : afficher « paiement en cours de vérification », jamais un faux succès
- [ ] Reçu PDF automatique avec numéro de commande, envoyé par e-mail et téléchargeable
- [ ] Notifications e-mail : instructions de paiement, paiement confirmé ou rejeté — idempotentes et rejouables sans doublon
- [ ] Confirmation manuelle limitée aux utilisateurs autorisés et auditée
- [ ] WhatsApp : message pré-rempli au départ, aucune affirmation de livraison sans intégration officielle
- [ ] Scénarios testés en préproduction : échec, annulation, retard, notification dupliquée (tests approfondis en M11)

**Livrables :** flux de paiement fournisseur opérationnel, flux BaridiMob manuel documenté et testé avec accès admin restreint, reçus PDF.

**Critères d'acceptation (§18 — Commandes et paiements) :** un paiement en attente n'ouvre aucun accès ; une confirmation ouvre le droit une seule fois ; la confirmation manuelle est limitée aux utilisateurs autorisés et auditée ; le client voit un statut de paiement exact ; les notifications dupliquées ne créent aucun doublon.

**Dépendances :** M1 (choix fournisseur, statut légal et compte bancaire professionnel pour le paiement direct), M2, M6.

**Risques principaux (§20) :** passerelle indisponible ou conditions non remplies → repli manuel BaridiMob ; exigences légales bloquant les paiements → avis juriste (M1) ; doublons de notifications → idempotence ; faux succès affiché au client.

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
