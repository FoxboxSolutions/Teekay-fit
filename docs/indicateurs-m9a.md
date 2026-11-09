# Indicateurs du dashboard admin — définitions M9a

**Règle d'or (PRD §10, M9a) :** un indicateur ne s'affiche que si sa source de données est stockée en base. Aucune estimation, jamais. Sans source stockée ⇒ affichage **« non disponible »** (état vide explicite, jamais un chiffre approximatif).

**Fuseau horaire :** toutes les périodes « jour » et « mois » sont calculées en **Africa/Algiers** (UTC+1, pas d'heure d'été en Algérie — `src/lib/admin/period.ts`). Jamais en UTC. Une commande créée à 00h30 heure locale d'Alger le jour D appartient au jour D et au mois D (même si c'est le 23h30 UTC du jour D‑1).

| Indicateur | Numérateur | Dénominateur | Source stockée | Affichage si indisponible |
|---|---|---|---|---|
| Nouveaux leads | Nombre de `leads` créés dans la période (jour ou mois) | — (compte absolu) | `public.leads.created_at` | `0` si la table existe mais est vide ; « non disponible » si la source n'existe pas |
| Leads à relancer | Nombre de `leads` actifs (`status in ('new','contacted','interested','follow_up')`) dont `next_follow_up_at` tombe dans la période | Nombre total de leads actifs en pipeline (mêmes statuts, toute date) | `public.leads.status`, `leads.next_follow_up_at` | « non disponible » si `leads` absente |
| Commandes du jour / mois | Nombre de `orders` créés dans la période | — (compte absolu) | `public.orders.created_at` | idem |
| Revenu confirmé | Somme `orders.total_da` des commandes dont le paiement lié est `confirmed` et la commande non `refunded` | — (montant absolu en DA) | `public.orders` + `public.payments.status = 'confirmed'` | « non disponible » si l'une des deux sources manque |
| Paiements à vérifier | Nombre de `payments` avec `status = 'verifying'` | — (compte absolu) | `public.payments.status` | « non disponible » si `payments` absente |
| Taux de complétion du quiz | Nombre de `quiz_submissions` de la période avec `completed_at` non null | Nombre de `quiz_submissions` de la période avec `started_at` non null | `public.quiz_submissions.started_at`, `quiz_submissions.completed_at` | **« non disponible »** si `started_at` n'est pas persisté (pas de dénombrement de départ ⇒ pas de taux) |
| Conversion par offre | Nombre de `leads` `status = 'converted'` de la période ayant `offer_slug = X` | Nombre de `leads` créés de la période ayant `offer_slug = X` (taux par offre ; « non disponible » si zéro lead sur l'offre) | `public.leads.offer_slug`, `leads.status` | « non disponible » par offre sans lead dans la période |

**Détails de calcul**

- **Période jour :** `[début du jour D en Africa/Algiers, début du jour D+1 en Africa/Algiers[`.
- **Période mois :** `[premier jour du mois M 00:00 Africa/Algiers, premier jour du mois M+1 00:00 Africa/Algiers[`.
- **Revenu confirmé :** une commande compte si elle existe un `payments` lié (`payments.order_id = orders.id`) avec `status = 'confirmed'` ET `orders.status <> 'refunded'`. Le montant retenu est la copie figée `orders.total_da` (jamais recalculé depuis `offers`).
- **Leads à relancer :** le dénominateur est l'effectif du pipeline actif, pas l'effectif total des leads (un lead `lost` ou `converted` n'est plus relançable).
- **Conversion par offre :** le taux s'affiche uniquement pour les offres ayant au moins un lead créé dans la période ; sinon « non disponible » pour cette offre.

**Aucune donnée fictive :** les indicateurs sont calculés sur les données réelles de l'environnement courant. En préproduction/production avec aucune donnée, l'affichage est `0` (ou « non disponible » selon la règle ci-dessus), jamais un jeu de démo.
