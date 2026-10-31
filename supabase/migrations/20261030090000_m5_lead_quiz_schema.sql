-- =============================================================================
-- M5 — Schéma de capture de leads / quiz (ajouts validés au plan)
--   * marqueur de revue humaine sur doublon de nom (needs_review)
--   * nom soumis divergent conservé sans écraser le nom du lead
--   * source « contact » pour le formulaire de contact (PRD §11)
--   * index UNIQUE partiel sur phone_norm → upsert par numéro (ON CONFLICT)
--   * consentements : types « recontact » et « age_18 »
--   * quiz_submissions : jeton de résultat haché, expiré, anti-énumération
-- =============================================================================

-- 1. leads — revue humaine + nom divergent (jamais de fusion automatique).
alter table public.leads
  add column if not exists needs_review  boolean not null default false,
  add column if not exists submitted_name text;

-- 2. leads.source — accepter « contact » (formulaire de contact, canal secondaire).
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check
  check (source in (
    'instagram', 'tiktok', 'facebook', 'google', 'site',
    'quiz', 'parrainage', 'autre', 'contact'
  ));

-- 3. Doublons — index UNIQUE partiel sur phone_norm (remplace l'index simple).
--    phone_norm peut être null (téléphone optionnel) → index partiel.
drop index if exists public.leads_phone_norm_idx;
create unique index if not exists leads_phone_norm_unique
  on public.leads (phone_norm)
  where phone_norm is not null;

-- 4. consents — types des nouvelles cases (recontact obligatoire, âge 18+).
alter table public.consents drop constraint if exists consents_consent_type_check;
alter table public.consents add constraint consents_consent_type_check
  check (consent_type in (
    'terms', 'privacy', 'refunds', 'marketing', 'quiz', 'health_waiver',
    'recontact', 'age_18'
  ));

-- 5. quiz_submissions — nom soumis divergent + jeton de résultat (≥128 bits,
--    stocké HACHÉ, expiration 72 h, lu côté serveur uniquement).
alter table public.quiz_submissions
  add column if not exists submitted_name         text,
  add column if not exists result_token_hash      text,
  add column if not exists result_token_expires_at timestamptz;

create unique index if not exists quiz_submissions_token_unique
  on public.quiz_submissions (result_token_hash)
  where result_token_hash is not null;
create index if not exists quiz_submissions_expires_idx
  on public.quiz_submissions (result_token_expires_at)
  where result_token_expires_at is not null;
