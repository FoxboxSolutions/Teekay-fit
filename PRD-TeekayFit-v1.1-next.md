# PRD — TeekayFit

**Version 1.1** · 27 octobre 2026 · Statut : brouillon pour validation produit et technique · Remplace la v1.0 (« Teekay »)

**Marque :** TeekayFit · **Domaine cible :** teekay.fit · **Marché initial :** Algérie · **Langue de lancement :** français (arabe en Phase 2b) · **Devise :** dinar algérien (DA)

## 1. Résumé

TeekayFit est la marque de coaching d’un athlète hybride (musculation, boxe anglaise, HYROX, course à pied, trail). Le produit réunit trois éléments qui partagent un seul backend :

1. **Site public et tunnel de vente** (teekay.fit) : présenter le coach, vendre les offres, capter les leads.
2. **Dashboard coach/admin** (web responsive, utilisable depuis un téléphone) : leads, clients, commandes, paiements, offres, séances.
3. **Applications mobiles Android et iOS** pour les clients : suivi d’entraînement, séances, rappels, accès sécurisé aux contenus achetés.

Principe directeur : le web génère les ventes dès la Phase 1 ; les applications (Phase 2) apportent une valeur native (séance du jour hors-ligne, journal de charges, rappels) et ne sont pas une copie du site. Le produit ne doit jamais inventer de certifications, de résultats ou de témoignages.

### Changements par rapport à la v1.0

| Sujet | v1.0 | v1.1 |
| --- | --- | --- |
| Marque et domaine | TeekayFit / Teekay.fit | TeekayFit / teekay.fit (achat et DNS à confirmer) |
| Applications iOS/Android | Hors périmètre | Phase 2, Flutter sur le même backend Supabase |
| Règles des stores | Non traitées | Section 12.3 : aucun achat ni lien de paiement dans l’app iOS |
| Paiement | « Slikpay » à confirmer | SlickPay et Chargily Pay comparés ; virement BaridiMob manuel avec référence unique au lancement |
| Conversion | Peu détaillée | Quiz, WhatsApp en CTA principal, offre gratuite, escalier d’offres, packs 3 mois, codes promo, parrainage, places restantes réelles |
| Crédibilité | Basique | PDF filigranés, reçus PDF, pages par discipline, collecte de preuves consenties |
| Santé | Questionnaire libre | Questionnaire d’aptitude (type PAR-Q) et décharge |
| Arabe | Phase 3 | Phase 2b (RTL prévu dès le départ) |
| Comptes | À décider | Compte créé après commande ; suppression de compte possible dans l’app |

## 2. Objectifs et non-objectifs

### Objectifs

1. Présenter le coach et ses disciplines de façon professionnelle et authentique.
2. Vendre les offres en dinars, avec un tunnel simple sur mobile.
3. Enregistrer chaque demande et chaque commande dans un vrai dashboard.
4. Livrer les fichiers et activer le coaching uniquement après paiement vérifié.
5. Donner au coach un outil pratique pour gérer leads, clients, paiements et séances.
6. Offrir aux clients une application mobile utile au quotidien (Phase 2).
7. Construire une base sécurisée, extensible sans refonte.

### Non-objectifs

- Renouvellement automatique des abonnements.
- Marketplace de coachs.
- Conseils médicaux ou plans générés par IA sans validation du coach.
- Automatisation non officielle de BaridiMob, ou collecte d’identifiants bancaires.
- Intégrations avec des objets connectés.
- Promesse de résultat physique garanti.
- Vente de contenus numériques à l’intérieur de l’application iOS (voir 12.3).

## 3. Utilisateurs

- **Prospect** : veut comprendre les offres, connaître le coach, poser une question avant de payer, savoir comment payer.
- **Client** : veut une confirmation claire, un accès sécurisé à ses fichiers, un suivi de ses séances et de sa progression, un moyen simple de joindre le coach.
- **Coach / administrateur** : veut gérer leads, clients, commandes, paiements, offres, places disponibles et séances ; vérifier les paiements manuels ; voir des métriques réelles. Il travaille surtout depuis son téléphone.

## 4. Marque et expérience

- **Nom :** TeekayFit. Descripteur public (« Hybrid Athlete & Performance Coach ») uniquement s’il est approuvé par le coach.
- **Direction visuelle :** premium, athlétique, minimale ; palette « luxury red & black » : noir profond `#0A0A0A` (fond), surfaces `#121212` et `#1A1A1A`, bordures `#2A2A2A`, texte principal blanc cassé `#F2EFEA`, texte secondaire gris chaud `#A8A29E`, rouge luxe `#A6111B` (fonds de bouton, badges, bandeaux), rouge vif `#E8323B` (« FIT », liens, icônes, états actifs ; texte rouge en `#F6323B` pour respecter 4,5:1), bordeaux `#7A0C13` (survol, dégradés) ; rouge limité à moins de 10 % de la surface d'une page ; aucune couleur or ; photos authentiques du coach ; typographie forte (une police condensée en gras pour les titres, une police sobre pour le texte).
- **Kit de marque minimal :** monogramme, palette, typographies, modèles Instagram et stories cohérents.
- **À éviter :** photos génériques, faux compteurs, témoignages non vérifiés, animations excessives.
- **Accessibilité :** mobile-first, navigation au clavier, focus visibles, contrastes suffisants, libellés et erreurs de formulaire explicites, textes alternatifs, respect de la préférence « réduire les animations ».
- **Langues :** français au lancement. L’architecture prévoit l’arabe et la mise en page RTL dès le départ ; l’arabe est livré en Phase 2b.
- **Performance (réseaux mobiles algériens) :** images WebP/AVIF avec image d’attente, chargement différé, vidéo hero courte (10 à 15 s) optimisée, objectif de chargement du contenu principal inférieur à 2,5 s sur mobile.

## 5. Offres et règles commerciales

Les noms, contenus et prix sont modifiables depuis le dashboard. Les prix ci-dessous sont les entrées validées par le business ; les éléments marqués « à valider » sont des propositions.

| Offre | Prix | Contenu | Livraison / activation |
| --- | --- | --- | --- |
| Mini-programme gratuit (à valider) | 0 DA | Mini-programme de 3 jours ou extrait de PDF, en échange d’un lead avec consentement | Lien sécurisé après saisie du formulaire |
| Starter | 2 000 DA, paiement unique | 2 PDF : programme d’entraînement et programme de nutrition | Téléchargement sécurisé après paiement confirmé |
| Coaching en ligne | 6 000 DA pour 1 mois | Programme personnalisé, conseils nutritionnels dans les limites de la qualification du coach, suivi WhatsApp, bilan et ajustements | Activation après paiement confirmé et questionnaire |
| Coaching en présentiel | 10 000 DA pour 1 mois | Programme personnalisé, 4 séances en présentiel, correction technique, suivi | Activation après paiement confirmé et questionnaire |
| Packs 3 mois (à valider) | Prix et remise à définir | Coaching en ligne ou en présentiel sur 3 mois, paiement unique, sans renouvellement automatique | Idem |

### Règles

- Tous les prix sont affichés en DA et stockés en base, jamais codés en dur.
- Chaque commande conserve une copie figée de l’offre, du prix, de la devise et des conditions.
- Pas de renouvellement automatique : un nouveau mois exige un nouvel achat explicite.
- Inclusions, exclusions, durée et conditions sont visibles avant le paiement.
- Aucune promesse de résultat garanti.
- **Places restantes :** un compteur réel et configurable par le coach (surtout pour le présentiel), jamais un faux compteur.
- **Codes promo et parrainage :** codes à usage limité (date, quantité, offre ciblée) ; un client peut parrainer un ami, la récompense étant définie par le coach.
- **Passerelle Starter vers coaching (à valider) :** les 2 000 DA du Starter sont déduits d’un coaching acheté dans les 14 jours.

### Décisions business à trancher avant la page de vente

- **En ligne :** fréquence des check-ins, délai de réponse WhatsApp, nombre de révisions, règle de date de début.
- **Présentiel :** salle ou lieu, durée d’une séance, règles de réservation et d’annulation, entrée en salle incluse ou non.
- **Marge :** vérifier la rentabilité du présentiel à 10 000 DA (4 séances, programme et suivi, salle, déplacements). Un prix trop bas contredit le positionnement premium.

## 6. Périmètre et phases

| Phase | Contenu |
| --- | --- |
| **Phase 0** | Décisions business, statut légal, domaine, comptes développeur, choix du paiement |
| **Phase 1 : MVP web commercial** | Site public, pages d’offres et de disciplines, quiz, FAQ, contact, tunnel de commande, paiement (direct ou manuel), livraison sécurisée des PDF, CRM, dashboard, notifications de base, pages légales, sécurité et sauvegardes |
| **Phase 2 : Apps et suivi** | Applications Android/iOS, portail client web, questionnaire d’aptitude, gestion des périodes de coaching, programmes assignés, séances en présentiel, suivi de progression |
| **Phase 2b** | Version arabe avec RTL |
| **Phase 3 : Croissance** | Blog et SEO, attribution des campagnes, analytics avancés, relances automatisées, fonctions de suivi supplémentaires selon les besoins réels |

Les Phases 2 et 3 ne bloquent pas le lancement de la Phase 1, sauf décision explicite du propriétaire.

## 7. Site public

### Routes

- `/` accueil · `/about` coach · `/coaching` offres · `/coaching/starter` · `/coaching/online` · `/coaching/in-person`
- `/disciplines/[hyrox|running|trail|boxe|musculation]` pages par discipline (SEO et ciblage publicitaire)
- `/quiz` · `/results` (uniquement avec preuves réelles et autorisées) · `/faq` · `/contact`
- `/checkout/[offre]` · `/payment/[orderId]` · `/login` et `/register`
- `/legal/privacy` · `/legal/terms` · `/legal/refunds`

### Sections de l’accueil

1. Hero avec proposition de valeur, vidéo courte et CTA WhatsApp.
2. Présentation du coach.
3. Disciplines (formulation approuvée par le coach).
4. Trois offres avec prix et inclusions, et places restantes réelles.
5. Méthode : comment ça marche.
6. Preuves authentiques, uniquement si elles existent et sont autorisées.
7. FAQ.
8. Appel à l’action final et contact.
9. Pied de page avec liens légaux et réseaux sociaux.

### Quiz « Trouve ton programme »

- 5 à 6 questions : objectif, niveau, disponibilité, matériel ou salle, préférence (en ligne ou présentiel), budget indicatif.
- Le résultat recommande une offre avec une explication courte.
- Le lead est créé avec consentement explicite ; la source est « quiz ».
- Un bouton ouvre WhatsApp avec un message pré-rempli (offre recommandée, objectif).

### WhatsApp comme canal principal

- Bouton fixe sur mobile et message pré-rempli adapté à chaque offre.
- Le formulaire reste disponible en canal secondaire.
- Ne jamais affirmer qu’un message WhatsApp a été livré sans intégration officielle qui le confirme.

### Profil du coach

Le propriétaire fournit et approuve : nom public, biographies courte et longue, expérience réelle, qualifications vérifiées, photos, réseaux sociaux, contacts. Aucune qualification, récompense, record, témoignage ou statistique ne doit être inventé.

### Collecte de preuves

Processus : proposer aux premiers clients une remise en échange d’un avant/après et d’un témoignage, avec consentement écrit et possibilité de retrait. Jusque-là, la preuve est le contenu du coach lui-même (séances, courses, compétitions).

## 8. Commande et paiement

### Création de commande

1. Valider l’offre et le prix côté serveur (ne jamais faire confiance au prix envoyé par le navigateur).
2. Appliquer un code promo valide, calculé côté serveur.
3. Créer la commande avec un identifiant unique et une référence lisible (ex. TKF-2610-0042).
4. Enregistrer la copie figée de l’offre, du prix et des conditions.
5. Statut `pending_payment` et paiement `pending`.
6. Afficher les prochaines étapes.

Informations collectées : nom, téléphone, e-mail (obligatoire : lien magique et accès aux PDF), offre, informations d’onboarding nécessaires, acceptation des conditions (version et horodatage enregistrés), mode de paiement. Le compte client est créé automatiquement après la commande (lien magique par e-mail ; connexion par téléphone désactivée au lancement).

### Statuts

- **Commande :** `pending_payment`, `paid`, `cancelled`, `refunded`.
- **Paiement :** `pending`, `verifying`, `confirmed`, `failed`, `rejected`, `refunded`.

Les transitions sont gérées côté serveur et auditées. Un paiement en attente, échoué, rejeté ou annulé n’ouvre jamais d’accès. Seule une confirmation vérifiée côté serveur déclenche la livraison. Les notifications répétées d’un fournisseur ne créent ni doublon de commande, de paiement, de droit d’accès ni de message.

### Fournisseur de paiement

Service de paiement indépendant du fournisseur : création du paiement, vérification serveur, traitement des notifications authentifiées, enregistrement de la référence, gestion des cas échoué, annulé, retardé et dupliqué, réconciliation avec la commande.

- **SlickPay** (« Slikpay » dans la v1.0) : cartes CIB et Edahabia algériennes uniquement, pas de cartes internationales.
- **Chargily Pay** : alternative orientée développeurs, Edahabia et CIB.
- Les passerelles exigent généralement un registre du commerce et un compte bancaire professionnel : le statut légal du coach (registre du commerce, auto-entrepreneur) est à clarifier en Phase 0.
- À confirmer directement auprès de chaque fournisseur : éligibilité du marchand, frais, règlement, webhooks, remboursements, moyens de paiement supportés.
- Les secrets restent côté serveur, jamais dans le navigateur ni dans les journaux.

### Repli manuel : virement BaridiMob

1. Afficher les instructions de paiement configurées par le propriétaire, avec la **référence de commande unique à mettre en motif du virement**.
2. Demander la référence de transaction et, si besoin, une capture du reçu.
3. Passer le paiement en `verifying`.
4. Un administrateur autorisé vérifie les fonds via le canal officiel, puis confirme ou rejette (administrateur, horodatage et motif enregistrés).
5. Débloquer le produit uniquement après confirmation.

Une capture d’écran ne suffit pas comme preuve. Ne jamais demander mot de passe, PIN, OTP ou identifiants bancaires. Si la confirmation tarde, afficher « paiement en cours de vérification », jamais un faux succès.

### Livraison et reçus

- **PDF filigranés** : chaque téléchargement est tamponné au nom et au téléphone du client pour décourager le partage.
- Fichiers privés, liens signés à durée courte, droit d’accès vérifié côté serveur.
- **Reçu PDF** automatique avec numéro de commande, envoyé et téléchargeable.

## 9. Espace client et questionnaire

Disponible sur le web et dans l’application (Phase 2). Le client peut voir ses commandes et statuts, accéder à ses PDF, remplir son questionnaire, voir les dates de début et de fin de son coaching, consulter ses programmes et bilans, gérer ses séances et contacter le coach. Il n’accède qu’à ses propres données ; un coaching expiré n’est jamais présenté comme actif.

### Questionnaire d’aptitude et d’objectifs

- Objectifs, expérience, disciplines préférées, disponibilités, équipement ou salle.
- **Questionnaire d’aptitude à l’effort (type PAR-Q)** et décharge à accepter avant de démarrer un coaching.
- Les données de santé sont sensibles : minimiser, restreindre l’accès, définir la durée de conservation, recueillir le consentement requis. La plateforme n’est pas un service médical et ne pose aucun diagnostic.
- Les photos de progression sont privées, accessibles uniquement au client et au coach.

## 10. Dashboard coach/admin

Accessible sur `/admin`, en web responsive installable (PWA) pour un usage quotidien sur téléphone. Réservé aux administrateurs explicitement autorisés ; personne ne peut s’attribuer un rôle ; permissions appliquées côté serveur et en base, pas seulement dans l’interface.

### Modules

1. **Vue d’ensemble** : compteurs et revenus réels.
2. **Leads** : pipeline CRM, relances, leads issus du quiz.
3. **Clients** : fiche et historique de commandes.
4. **Commandes** : statut, copie figée de l’offre, livraison.
5. **Paiements** : méthode, statut, références, vérification, historique d’audit.
6. **Offres** : descriptions, prix, disponibilité, inclusions, conditions, places restantes.
7. **Codes promo et parrainage**.
8. **Programmes** : dépôt des PDF privés et lien avec les droits d’accès.
9. **Séances** : planning des séances en présentiel (Phase 2).
10. **Paramètres** : informations business, canaux de contact, instructions de paiement, politiques.
11. **Journal d’audit** : actions sensibles et décisions.

### Indicateurs

Nouveaux leads, leads à relancer, taux de complétion du quiz, commandes du jour et du mois, commandes en attente de paiement, paiements à vérifier, revenu confirmé (paiements confirmés non remboursés), conversion par offre. Aucune donnée fictive en production ; les états vides l’indiquent clairement.

## 11. CRM et leads

- **Champs :** nom, téléphone, e-mail (optionnel), objectif, offre visée, source (Instagram, TikTok, Facebook, Google, site, quiz, parrainage, autre), statut, responsable, prochaine relance, notes (accès restreint), consentement, dates.
- **Pipeline :** `new`, `contacted`, `interested`, `follow_up`, `converted`, `lost`.
- **Fonctions :** recherche par nom et téléphone ; filtres par statut, offre, source, relance ; notes ; changements de statut audités ; export CSV réservé aux utilisateurs autorisés ; conversion en client sans doublon.
- Les numéros sont normalisés pour la détection de doublons, mais la fusion passe par une revue humaine.
- Aucun message marketing sans consentement et base légale.

## 12. Applications mobiles Android et iOS (Phase 2)

### 12.1 Technologie

- **Flutter** pour Android et iOS, un seul code source.
- **Même projet Supabase que le web** : authentification, PostgreSQL avec RLS, stockage privé avec liens signés.
- Notifications push : FCM (Android) et APNs (iOS). Stockage local pour l’usage hors-ligne.

### 12.2 Fonctions de la première version de l’app

- Connexion (lien magique ou téléphone) — téléphone : plus tard (désactivé au lancement).
- Mes commandes et statuts de paiement.
- Mes PDF, consultables hors-ligne.
- **Séance du jour**, disponible hors-ligne.
- Bibliothèque vidéo d’exercices et minuteur de repos.
- **Journal des séries et des charges** avec courbes de progression.
- Check-in hebdomadaire avec photos privées.
- Réservation et annulation de séances en présentiel, avec rappels.
- Contact du coach via WhatsApp.
- Profil, préférences de notification et **suppression du compte depuis l’app**.

Plus tard : mode coach dans l’app, messagerie intégrée, défis, mesures corporelles détaillées.

### 12.3 Règles des stores (à valider avant le développement)

- **iOS :** Apple exige l’achat intégré pour les contenus numériques et pour les services de messagerie différée ; seul un service individuel en temps réel peut utiliser un autre moyen de paiement. Les PDF et le coaching en ligne par WhatsApp sont donc à risque.
- **Conception retenue :** l’app est un espace client. Les achats se font sur le web. L’app iOS ne contient aucun bouton d’achat ni lien vers un paiement externe pour les contenus numériques et le coaching en ligne. Le coaching en présentiel, consommé hors de l’app, peut se réserver sans achat intégré.
- **Android :** règles comparables pour les biens numériques ; appliquer la même conception.
- Apple juge au cas par cas : prévoir une soumission de test et une réponse de recours argumentée.
- Respecter les fiches de confidentialité (Apple) et la section Sécurité des données (Google Play).

### 12.4 Comptes développeur

| Store | Coût | Point d’attention |
| --- | --- | --- |
| Google Play | 25 $, unique | Le tableau officiel de Google indique que l’Algérie supporte l’inscription développeur et marchand ; achats en DZD possibles pour les utilisateurs |
| Apple Developer | 99 $/an | **Inscription depuis l’Algérie non confirmée** : à vérifier en premier, avant tout développement iOS |

Les comptes doivent appartenir au titulaire réel de l’activité : pas de prête-nom. Si Apple n’est pas possible, lancer Android et le web d’abord (le web fonctionne aussi comme PWA sur iPhone).

### 12.5 Qualité

Versions minimales d’OS définies, accessibilité (tailles de texte, contrastes, lecteurs d’écran), suivi des plantages, mise à jour forcée possible, liens profonds vers les offres et séances, textes prêts pour l’arabe et le RTL.

## 13. Notifications

- **E-mail :** demande reçue, commande créée, instructions de paiement, paiement confirmé ou rejeté, accès aux PDF, reçu, début du coaching.
- **Admin :** nouveau lead, nouvelle commande, paiement à vérifier.
- **Push (Phase 2) :** rappels de séance, check-in hebdomadaire, nouveau programme.
- **WhatsApp :** lien ou message pré-rempli au départ ; aucune affirmation de livraison sans intégration officielle.
- Toutes les notifications sont rejouables sans doublon (idempotentes).

## 14. Modèle de données

**Phase 1 :** `profiles`, rôles gérés uniquement côté serveur, `offers`, `offer_files`, `leads`, `quiz_submissions`, `customers`, `orders`, `order_items`, `payments`, `payment_events`, `promo_codes`, `referrals`, `capacity_slots`, `receipts`, `consents`, `audit_logs`.

**Phase 2 :** `questionnaires`, `coaching_enrollments`, `assigned_programs`, `exercises`, `workout_logs`, `check_ins`, `sessions`, `bookings`, `progress_entries`, `device_tokens`, `notifications`, `account_deletion_requests`.

### Règles

- Identifiants uniques et stables ; horodatages en UTC, affichés en heure locale.
- Montants en entiers de DA (tous les montants sont en dinars entiers), choix documenté.
- Copie figée de l’offre et du prix à chaque commande.
- Clés étrangères et index appropriés.
- Politique de conservation, d’archivage et de suppression définie.
- Ne jamais stocker de données de carte, PIN, OTP ou identifiants bancaires.
- Audit des vérifications de paiement, remboursements, changements de rôle, changements de prix, codes promo et accès aux fonctions sensibles.

## 15. Architecture technique

- **Web :** Next.js avec TypeScript, Tailwind CSS, composants accessibles.
- **Backend :** Supabase (PostgreSQL, Auth, Storage privé), RLS plus contrôles d’autorisation côté serveur.
- **Mobile :** Flutter (section 12).
- **Hébergement, domaine :** hébergeur adapté à la stack, DNS de teekay.fit, HTTPS, CDN pour les médias.
- **Environnements :** développement, préproduction et production séparés ; migrations pour tout changement de schéma.
- **Observabilité :** suivi des erreurs, journaux structurés, surveillance de disponibilité.
- **Sécurité applicative :** validation serveur de toutes les entrées, limitation de débit (authentification, leads, commande, paiement, quiz), protection CSRF, XSS, injection, IDOR et élévation de privilèges, signature des webhooks vérifiée, clés d’idempotence sur paiements et livraisons.
- **Secrets :** jamais dans Git, jamais dans le code client, jamais dans les journaux ; gérés par le gestionnaire de secrets de l’hébergeur ; à renouveler en cas d’exposition.
- **Sauvegardes :** sauvegardes de la base et test périodique de restauration.

## 16. Sécurité, vie privée et légal

Avant le lancement, le propriétaire et un juriste local examinent : statut commercial du coach (registre du commerce, auto-entrepreneur), e-commerce, protection du consommateur, collecte des paiements, facturation, remboursements, et protection des données personnelles (loi 18-07).

- Publier des conditions, une politique de confidentialité et une politique d’annulation et de remboursement exactes.
- Enregistrer les consentements ; ne collecter que les données nécessaires.
- Définir l’âge minimum et le traitement des mineurs (autorisation parentale) : décision à prendre.
- Contact dédié pour les demandes liées aux données ; durées de conservation et procédure de suppression.
- Authentification forte pour les administrateurs.
- Aucune promesse de conformité légale du seul fait de ces fonctions : la conformité se valide pour le montage réel de l’activité.

## 17. Analytics et SEO

- **SEO :** titres et descriptions uniques, hiérarchie sémantique, URL canoniques sur teekay.fit, sitemap, robots, images optimisées, métadonnées de partage, pages par discipline.
- **Événements :** `view_offer`, `quiz_start`, `quiz_complete`, `whatsapp_click`, `submit_lead`, `start_checkout`, `create_order`, `payment_pending`, `payment_confirmed`, `download_program`, `app_install` (Phase 2).
- Aucun événement d’achat avant la confirmation serveur du paiement. Respecter le consentement pour les traceurs publicitaires.

## 18. Critères d’acceptation

### Site et offres

- Les trois offres affichent les bons prix et inclusions ; le site fonctionne sur mobile et ordinateur.
- Aucun faux témoignage, certification ou statistique.
- Le quiz crée un lead et recommande une offre ; le bouton WhatsApp s’ouvre avec le bon message.

### Commandes et paiements

- Le total est calculé côté serveur ; la commande conserve une copie figée.
- Un paiement en attente n’ouvre aucun accès ; une confirmation ouvre le droit une seule fois.
- Les notifications dupliquées ne créent aucun doublon.
- La confirmation manuelle est limitée aux utilisateurs autorisés et auditée.
- Le client voit un statut de paiement exact.

### Fichiers

- Fichiers privés ; impossible d’y accéder en devinant une URL.
- Droit valide requis pour générer un lien ; les liens expirent ; chaque PDF est filigrané.

### Sécurité et administration

- Les pages et API admin rejettent les utilisateurs non autorisés ; un client ne lit jamais les données d’un autre.
- Personne ne peut élever son propre rôle.
- Tableaux de bord alimentés uniquement par des données réelles.
- Actions critiques dans le journal d’audit ; sauvegardes et procédure de restauration en place.

### Applications (Phase 2)

- Aucun achat ni lien de paiement externe dans l’app iOS pour les contenus numériques.
- Suppression de compte disponible dans l’app.
- La séance du jour et les PDF s’ouvrent hors-ligne.
- Les rappels de séance arrivent en push sur Android et iOS.

## 19. Décisions ouvertes

| Décision | À résoudre avant |
| --- | --- |
| Achat de teekay.fit et DNS (plan B si indisponible) | Phase 1 |
| Statut légal du coach (registre du commerce, auto-entrepreneur) et compte bancaire professionnel | Paiement direct |
| Choix : SlickPay, Chargily Pay ou virement manuel seul | Phase 1 |
| Inscription Apple Developer depuis l’Algérie | Développement iOS |
| Biographie, photos, qualifications et liens approuvés par le coach | Contenu du site |
| PDF finaux du Starter | Lancement |
| Contenu précis des deux offres de coaching (voir section 5) | Page de vente |
| Marge du présentiel et tarifs des packs 3 mois | Page de vente |
| Crédit Starter vers coaching, mini-programme gratuit, parrainage | Phase 1 |
| Âge minimum et politique pour les mineurs | Lancement |
| Politique légale et de remboursement | Lancement |
| Calendrier de l’arabe | Phase 2b |

## 20. Risques

| Risque | Atténuation |
| --- | --- |
| Refus ou impossibilité d’inscription Apple Developer | Vérifier en Phase 0 ; lancer web et Android d’abord, le web fonctionne en PWA sur iPhone |
| Rejet de l’app iOS pour paiement hors achat intégré | Conception en espace client, sans achat ni lien externe ; soumission de test |
| Passerelle indisponible ou conditions non remplies | Repli manuel BaridiMob ; couche de paiement indépendante du fournisseur |
| PDF remis avant paiement vérifié | Droits d’accès côté serveur, stockage privé |
| Partage des PDF achetés | Filigrane par client, liens à durée courte |
| Doublons de notifications de paiement | Traitement idempotent, identifiants d’événements uniques |
| Données de santé exposées | Minimisation, RLS, journaux d’audit, stockage privé |
| Attentes floues sur les offres | Publier inclusions, délais de réponse, durée et annulation avant le paiement |
| Faux effet de preuve sociale | Uniquement des preuves réelles et autorisées |
| Présentiel peu rentable à 10 000 DA | Calculer la marge ; ajuster prix, places ou inclusions |
| Dérive du périmètre | Prioriser la Phase 1 ; apps et suivi en Phase 2 |
| Exigences légales bloquant les paiements | Valider statut et exigences avec un juriste avant de percevoir en ligne |

## 21. Séquence de livraison

1. **Phase 0 :** trancher les décisions ouvertes, vérifier Apple Developer, clarifier le statut légal, acheter le domaine.
2. Squelette du projet, environnements, système de design, migrations, authentification.
3. Pages publiques, offres configurables, pages par discipline.
4. Quiz, capture de leads et CRM.
5. Commandes, statuts de paiement, couche fournisseur.
6. Paiement approuvé, virement BaridiMob manuel, reçus.
7. Livraison sécurisée et filigranée des PDF.
8. Dashboard et journal d’audit.
9. Notifications, analytics, SEO, pages légales.
10. Tests de sécurité, d’usage mobile, des cas limites de paiement, des sauvegardes ; déploiement.
11. **Lancement** avec offres et contenus approuvés.
12. **Phase 2 :** applications Android et iOS, portail client, questionnaire, séances, progression.
13. **Phase 2b :** arabe. **Phase 3 :** croissance.

Les délais sont fixés par l’équipe de développement après confirmation du paiement et du périmètre ; une estimation n’est pas une garantie.

## 22. Définition de « terminé » pour la Phase 1

- Le propriétaire a approuvé les textes, prix, inclusions, images et pages légales.
- Domaine, hébergement et HTTPS configurés.
- Le paiement retenu est testé, y compris les échecs et les notifications dupliquées ; le virement manuel est documenté et testé avec un accès admin restreint.
- PDF privés, filigranés et accessibles uniquement après confirmation.
- CRM, commandes, paiements et dashboard utilisent des données réelles.
- Tests d’autorisation et de confidentialité réussis.
- Mises en page mobile et ordinateur validées, performance mobile contrôlée.
- Suivi des erreurs, sauvegardes et restauration configurés.
- Le propriétaire a testé le parcours complet, de la page d’offre jusqu’à la livraison.

## Annexe : variables d’environnement indicatives

Les noms sont illustratifs ; n’implémenter que ceux utiles.

`NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement), `STORAGE_BUCKET_PRIVATE`, `PAYMENT_PROVIDER`, `PAYMENT_API_BASE_URL`, `PAYMENT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET`, `EMAIL_PROVIDER_API_KEY`, `ERROR_TRACKING_DSN`, `FCM_SERVICE_ACCOUNT` et `APNS_KEY` (serveur, Phase 2).

Règles : ne jamais valider de vraies valeurs dans Git ; ne jamais mettre un secret dans une variable `NEXT_PUBLIC_*` ; garder les secrets de production dans le gestionnaire de l’hébergeur ; renouveler les identifiants s’ils sont exposés.
