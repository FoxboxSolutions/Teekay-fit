-- =============================================================================
-- M4 — Contenu des offres : inclusions, durée, exclusions, conditions + seed
--
-- Les prix et noms sont les entrées validées par le business (PRD §5) : ils
-- sont seedés ci-dessous et restent modifiables depuis le dashboard (M9).
-- Les formulations d'inclusions sont un jeton à faire relire par le coach
-- (notamment tout ce qui touche à la nutrition et à la qualification réelle).
-- =============================================================================

alter table public.offers
  add column if not exists inclusions  jsonb,          -- tableau de chaînes
  add column if not exists exclusions  jsonb,          -- tableau de chaînes
  add column if not exists duration    text,           -- ex. « 1 mois », « paiement unique »
  add column if not exists conditions  text;           -- conditions avant paiement

-- Seed des trois offres actives (PRD §5). Idempotent : upsert par slug.
insert into public.offers
  (slug, name, description, offer_type, price_da, currency, is_active, is_optional,
   inclusions, exclusions, duration, conditions)
values
  (
    'starter',
    'Starter',
    'Deux programmes PDF : entraînement et nutrition.',
    'starter',
    2000,
    'DA',
    true,
    false,
    '["Programme d''entraînement (PDF)", "Programme de nutrition (PDF)"]'::jsonb,
    '["Aucun suivi WhatsApp (inclus uniquement dans les coachings)"]'::jsonb,
    'paiement unique',
    'Paiement unique, pas de renouvellement automatique.'
  ),
  (
    'online',
    'Coaching en ligne',
    'Programme personnalisé et suivi à distance.',
    'coaching_online',
    6000,
    'DA',
    true,
    false,
    '["Programme personnalisé", "Conseils nutritionnels (dans les limites de la qualification du coach)", "Suivi WhatsApp", "Bilan et ajustements"]'::jsonb,
    '["Séances en présentiel"]'::jsonb,
    '1 mois',
    'Pas de renouvellement automatique : un nouveau mois exige un nouvel achat explicite.'
  ),
  (
    'in-person',
    'Coaching en présentiel',
    'Programme personnalisé et séances de coaching en face à face.',
    'coaching_in_person',
    10000,
    'DA',
    true,
    false,
    '["Programme personnalisé", "4 séances en présentiel", "Correction technique", "Suivi"]'::jsonb,
    '[]'::jsonb,
    '1 mois',
    'Pas de renouvellement automatique : un nouveau mois exige un nouvel achat explicite.'
  )
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  price_da    = excluded.price_da,
  is_active   = excluded.is_active,
  is_optional = excluded.is_optional,
  inclusions  = excluded.inclusions,
  exclusions  = excluded.exclusions,
  duration    = excluded.duration,
  conditions  = excluded.conditions;
