-- =============================================================================
-- M2 · Schéma Phase 1 (PRD §14)
-- Règles : uuid PK stables, horodatages UTC (timestamptz), montants en entiers
-- de DA, clés étrangères et index, copie figée de l'offre/du prix dans les
-- commandes, audit_logs en ajout seul.
-- Sécurité : RLS activée sur CHAQUE table à sa création (refus par défaut —
-- aucune politique dans cette migration : aucune ligne n'est accessible) ;
-- auto_expose_new_tables = false : aucune exposition API sans GRANT explicite
-- (voir migration 0002_rls_policies).
-- =============================================================================

-- Horodatages : mise à jour automatique des colonnes updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles — comptes liés à auth.users (compte créé après commande, M6)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  phone         text,
  display_name  text,
  locale        text not null default 'fr',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Compte client créé automatiquement à l'inscription (lien magique / téléphone)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- user_roles — rôles gérés uniquement côté serveur.
-- Aucune politique d'écriture client (refus par défaut) : la modification passe
-- par le service-role / RPC admin (migration 0002) avec trace d'audit.
-- -----------------------------------------------------------------------------
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('admin')),
  granted_by  uuid references public.profiles (id),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles (id),
  check (not (revoked_at is not null and revoked_by is null))
);
create unique index user_roles_active_unique
  on public.user_roles (user_id, role)
  where revoked_at is null;
create index user_roles_user_idx on public.user_roles (user_id);
alter table public.user_roles enable row level security;

-- -----------------------------------------------------------------------------
-- offers — configurables depuis le dashboard, prix jamais codés en dur
-- -----------------------------------------------------------------------------
create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text,
  offer_type    text not null check (offer_type in ('free', 'starter', 'coaching_online', 'coaching_in_person', 'pack_3m')),
  price_da      integer not null check (price_da >= 0),
  currency      text not null default 'DA' check (currency = 'DA'),
  is_active     boolean not null default false,
  is_optional   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.offers enable row level security;
create index offers_active_idx on public.offers (is_active);

create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- offer_files — ligne par fichier du stockage privé (dépôt manuel en M8,
-- interface d'upload admin en M9 — incohérence §21 n°7 tranchée)
-- -----------------------------------------------------------------------------
create table public.offer_files (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references public.offers (id) on delete cascade,
  storage_path  text not null unique,
  label         text not null,
  file_kind     text not null default 'pdf' check (file_kind in ('pdf')),
  created_at    timestamptz not null default now()
);
alter table public.offer_files enable row level security;
create index offer_files_offer_idx on public.offer_files (offer_id);

-- -----------------------------------------------------------------------------
-- leads — pipeline CRM (PRD §11)
-- -----------------------------------------------------------------------------
create table public.leads (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  phone_norm       text,
  email            text,
  goal             text,
  offer_slug       text,
  source           text not null check (source in ('instagram', 'tiktok', 'facebook', 'google', 'site', 'quiz', 'parrainage', 'autre')),
  status           text not null default 'new' check (status in ('new', 'contacted', 'interested', 'follow_up', 'converted', 'lost')),
  owner_id         uuid references public.profiles (id) on delete set null,
  next_follow_up_at timestamptz,
  notes            text,
  consent          boolean not null default false,
  consent_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (consent = true or consent_at is null)
);
alter table public.leads enable row level security;
create index leads_status_idx on public.leads (status);
create index leads_source_idx on public.leads (source);
create index leads_follow_up_idx on public.leads (next_follow_up_at);
create index leads_phone_norm_idx on public.leads (phone_norm);
create index leads_created_at_idx on public.leads (created_at desc);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- quiz_submissions — réponses structurées du quiz « Trouve ton programme »
-- -----------------------------------------------------------------------------
create table public.quiz_submissions (
  id                     uuid primary key default gen_random_uuid(),
  lead_id                uuid references public.leads (id) on delete set null,
  answers                jsonb not null check (jsonb_typeof(answers) = 'object'),
  recommended_offer_slug text,
  started_at             timestamptz not null default now(),
  completed_at           timestamptz,
  created_at             timestamptz not null default now()
);
alter table public.quiz_submissions enable row level security;
create index quiz_submissions_lead_idx on public.quiz_submissions (lead_id);

-- -----------------------------------------------------------------------------
-- customers — conversion d'un lead en client sans doublon
-- -----------------------------------------------------------------------------
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles (id) on delete set null,
  name          text not null,
  phone         text,
  phone_norm    text,
  email         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index customers_profile_unique on public.customers (profile_id)
  where profile_id is not null;
create index customers_phone_norm_idx on public.customers (phone_norm);
alter table public.customers enable row level security;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- orders — copie figée de l'offre, du prix et des conditions (PRD §5, §8)
-- -----------------------------------------------------------------------------
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  customer_id       uuid not null references public.customers (id),
  status            text not null default 'pending_payment'
                    check (status in ('pending_payment', 'paid', 'cancelled', 'refunded')),
  -- copie figée (jamais recalculée depuis offers)
  offer_id          uuid references public.offers (id) on delete set null,
  offer_slug        text not null,
  offer_name        text not null,
  unit_price_da     integer not null check (unit_price_da >= 0),
  discount_da       integer not null default 0 check (discount_da >= 0),
  total_da          integer not null check (total_da >= 0),
  currency          text not null default 'DA' check (currency = 'DA'),
  conditions_version text,
  payment_method    text,
  promo_code_id     uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (total_da >= 0 and total_da <= unit_price_da + 0)
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_status_idx on public.orders (status);
create index orders_created_at_idx on public.orders (created_at desc);
alter table public.orders enable row level security;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- order_items — lignes de commande avec copie figée unitaire
-- -----------------------------------------------------------------------------
create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  offer_id        uuid references public.offers (id) on delete set null,
  offer_slug      text not null,
  offer_name      text not null,
  unit_price_da   integer not null check (unit_price_da >= 0),
  quantity        integer not null default 1 check (quantity > 0),
  subtotal_da     integer not null check (subtotal_da >= 0),
  created_at      timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);
alter table public.order_items enable row level security;

-- -----------------------------------------------------------------------------
-- payments — statuts serveur uniquement (PRD §8)
-- -----------------------------------------------------------------------------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  provider           text not null check (provider in ('slickpay', 'chargily', 'manual')),
  provider_reference text,
  amount_da          integer not null check (amount_da >= 0),
  currency           text not null default 'DA' check (currency = 'DA'),
  method             text,
  status             text not null default 'pending'
                     check (status in ('pending', 'verifying', 'confirmed', 'failed', 'rejected', 'refunded')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status);
create unique index payments_provider_ref_unique on public.payments (provider, provider_reference)
  where provider_reference is not null;
alter table public.payments enable row level security;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- payment_events — clé d'idempotence : (provider, provider_event_id) unique
-- -----------------------------------------------------------------------------
create table public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid references public.payments (id) on delete cascade,
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  payload           jsonb not null default '{}'::jsonb,
  received_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index payment_events_payment_idx on public.payment_events (payment_id);
alter table public.payment_events enable row level security;

-- -----------------------------------------------------------------------------
-- promo_codes — usage limité (date, quantité, offre ciblée)
-- -----------------------------------------------------------------------------
create table public.promo_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  discount_type  text not null check (discount_type in ('percent', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  max_uses       integer check (max_uses is null or max_uses > 0),
  used_count     integer not null default 0 check (used_count >= 0),
  valid_from     timestamptz,
  valid_until    timestamptz,
  offer_id       uuid references public.offers (id) on delete set null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.promo_codes enable row level security;

create trigger promo_codes_set_updated_at
  before update on public.promo_codes
  for each row execute function public.set_updated_at();

alter table public.orders
  add constraint orders_promo_code_fk
  foreign key (promo_code_id) references public.promo_codes (id)
  on delete set null;

-- -----------------------------------------------------------------------------
-- referrals — parrainage (optionnel, non bloquant)
-- -----------------------------------------------------------------------------
create table public.referrals (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  referrer_customer_id  uuid not null references public.customers (id) on delete cascade,
  referred_customer_id  uuid references public.customers (id) on delete set null,
  status                text not null default 'pending' check (status in ('pending', 'qualified', 'rewarded')),
  reward_description    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index referrals_referrer_idx on public.referrals (referrer_customer_id);
alter table public.referrals enable row level security;

create trigger referrals_set_updated_at
  before update on public.referrals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- capacity_slots — places restantes réelles (compteur configurable)
-- -----------------------------------------------------------------------------
create table public.capacity_slots (
  id          uuid primary key default gen_random_uuid(),
  offer_id    uuid not null references public.offers (id) on delete cascade,
  slot_date   date not null,
  capacity    integer not null check (capacity >= 0),
  reserved    integer not null default 0 check (reserved >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (reserved <= capacity),
  unique (offer_id, slot_date)
);
alter table public.capacity_slots enable row level security;

create trigger capacity_slots_set_updated_at
  before update on public.capacity_slots
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- receipts — reçu PDF par commande
-- -----------------------------------------------------------------------------
create table public.receipts (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  receipt_number text not null unique,
  pdf_path       text not null,
  issued_at      timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index receipts_order_idx on public.receipts (order_id);
alter table public.receipts enable row level security;

-- -----------------------------------------------------------------------------
-- consents — version + horodatage ; un seul sujet par ligne
-- (profil, lead ou commande) : conditions, quiz, marketing, décharge santé
-- -----------------------------------------------------------------------------
create table public.consents (
  id            uuid primary key default gen_random_uuid(),
  consent_type  text not null check (consent_type in ('terms', 'privacy', 'refunds', 'marketing', 'quiz', 'health_waiver')),
  version       text not null,
  accepted_at   timestamptz not null default now(),
  profile_id    uuid references public.profiles (id) on delete cascade,
  lead_id       uuid references public.leads (id) on delete cascade,
  order_id      uuid references public.orders (id) on delete cascade,
  check (num_nonnulls(profile_id, lead_id, order_id) = 1)
);
create index consents_profile_idx on public.consents (profile_id);
create index consents_lead_idx on public.consents (lead_id);
create index consents_order_idx on public.consents (order_id);
alter table public.consents enable row level security;

-- -----------------------------------------------------------------------------
-- audit_logs — EN AJOUT SEUL : trigger interdisant UPDATE et DELETE à tous
-- (y compris service_role). Lecture : administrateurs uniquement (0002).
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_role  text,
  action      text not null,
  entity_type text,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
create index audit_logs_action_idx on public.audit_logs (action);

create or replace function public.audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs est en ajout seul : % interdit', tg_op;
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();

-- -----------------------------------------------------------------------------
-- aptitude_questionnaires — questionnaire minimal Phase 1 (type PAR-Q).
-- Minimisation des données de santé : uniquement des booléens structurés, un
-- objectif et un niveau d'expérience à valeurs contraintes, AUCUN texte libre.
-- Conservation : 24 mois après création, puis suppression (voir fonction).
-- -----------------------------------------------------------------------------
create table public.aptitude_questionnaires (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null unique references public.orders (id) on delete cascade,
  customer_id           uuid not null references public.customers (id) on delete cascade,
  -- PAR-Q : aptitude à l'effort (7 questions, aucune donnée libre)
  q1_heart_condition         boolean not null,
  q2_exertion_chest_pain     boolean not null,
  q3_rest_chest_pain         boolean not null,
  q4_syncope                 boolean not null,
  q5_joint_bone_problem      boolean not null,
  q6_heart_medication        boolean not null,
  q7_other_restriction       boolean not null,
  -- résultat calculé côté serveur : aucun de ces champs ne pose de diagnostic
  medical_advice_recommended boolean not null default false,
  objective             text not null check (objective in ('strength', 'endurance', 'weight_loss', 'performance', 'hybrid')),
  experience_level      text not null check (experience_level in ('beginner', 'intermediate', 'advanced')),
  -- décharge (acceptation obligatoire)
  waiver_accepted       boolean not null default false check (waiver_accepted = true),
  waiver_accepted_at    timestamptz not null,
  waiver_version        text not null,
  created_at            timestamptz not null default now()
);
create index aptitude_questionnaires_customer_idx on public.aptitude_questionnaires (customer_id);
alter table public.aptitude_questionnaires enable row level security;

comment on table public.aptitude_questionnaires is
  'Questionnaire d''aptitude minimal Phase 1 (PRD §5/§9). Données de santé minimisées : '
  'booléens structurés uniquement, aucun texte libre, aucune posologie ni diagnostic. '
  'Conservation : 24 mois après création — purge par public.purge_expired_health_data(). '
  'Accès restreint : propriétaire de la commande et administrateurs.';

-- Suppression après conservation (24 mois) — exécution périodique documentée
-- dans docs/ (paramétrage et test en M11).
create or replace function public.purge_expired_health_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.aptitude_questionnaires
  where created_at < now() - interval '24 months';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;
revoke execute on function public.purge_expired_health_data() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- rate_limit_counters — limitation de débit (auth, leads, quiz, commande,
-- paiement) : table privée, appelée par la fonction security definer 0002.
-- -----------------------------------------------------------------------------
create table public.rate_limit_counters (
  bucket_key   text primary key,
  window_start timestamptz not null,
  hit_count    integer not null default 0 check (hit_count >= 0)
);
alter table public.rate_limit_counters enable row level security;
