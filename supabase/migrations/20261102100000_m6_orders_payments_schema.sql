-- =============================================================================
-- M6 — Schéma commandes & paiement (bloc 1 du plan validé)
--   * orders : idempotence (clé + hash du contenu), jeton de statut haché 14 j
--   * order_items : copie figée inclusions/conditions au moment de la commande
--   * payments.provider : provider fictif « fake » (dev/preview uniquement)
--   * payment_transitions : journal append-only des transitions de statut
--   * entitlements : ouverture d'accès UNE seule fois (unique par order_item)
--   * promo_codes : remise pourcentage < 100 (entiers DA, remise ≥ prix = refus
--     applicable côté serveur dans create_order — le prix vit dans orders)
--   * RLS + GRANTs étendus (refus par défaut, écriture service-role seul)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. orders — idempotence de création + jeton de statut opaque (≥128 bits,
--    haché SHA-256, expiré 14 jours, renouvelable à la connexion) :
--    même clé + même request_hash ⇒ commande d'origine retournée ;
--    même clé + hash différent ⇒ 409 (décision amendement 4).
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists idempotency_key       text,
  add column if not exists request_hash          text,
  add column if not exists status_token_hash     text,
  add column if not exists status_token_expires_at timestamptz;

create unique index if not exists orders_idempotency_key_unique
  on public.orders (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists orders_status_token_hash_unique
  on public.orders (status_token_hash)
  where status_token_hash is not null;

create index if not exists orders_status_token_expires_idx
  on public.orders (status_token_expires_at)
  where status_token_expires_at is not null;

alter table public.orders
  drop constraint if exists orders_idempotency_hash_check;
alter table public.orders
  add constraint orders_idempotency_hash_check
  check (idempotency_key is null or request_hash is not null);

-- -----------------------------------------------------------------------------
-- 2. order_items — copie figée des conditions de l'offre (jamais recalculée)
-- -----------------------------------------------------------------------------
alter table public.order_items
  add column if not exists inclusions jsonb,
  add column if not exists conditions text;

-- -----------------------------------------------------------------------------
-- 3. payments.provider — « fake » autorisé au niveau schéma ;
--    la garde applicative (refus en production/absente/invalide) vit dans
--    src/lib/payments/loader.ts sur APP_ENV (décision amendement 1).
-- -----------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('slickpay', 'chargily', 'manual', 'fake'));

-- -----------------------------------------------------------------------------
-- 4. payment_transitions — journal append-only : chaque transition de statut
--    de paiement (et le statut commande résultant) est tracée avec acteur et
--    motif. Idempotence : le webhook est déjà dédupliqué par payment_events
--    (provider, provider_event_id) ; une transition vers le statut courant est
--    un no-op géré par transition_payment (bloc 3).
-- -----------------------------------------------------------------------------
create table if not exists public.payment_transitions (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references public.payments (id) on delete cascade,
  order_id          uuid not null references public.orders (id) on delete cascade,
  from_status       text not null
                    check (from_status in ('pending', 'verifying', 'confirmed', 'failed', 'rejected', 'refunded')),
  to_status         text not null
                    check (to_status in ('pending', 'verifying', 'confirmed', 'failed', 'rejected', 'refunded')),
  order_status      text not null
                    check (order_status in ('pending_payment', 'paid', 'cancelled', 'refunded')),
  actor_id          uuid references public.profiles (id) on delete set null,
  actor_role        text,
  reason            text,
  provider_event_id text,
  created_at        timestamptz not null default now()
);
alter table public.payment_transitions enable row level security;
create index if not exists payment_transitions_payment_idx
  on public.payment_transitions (payment_id, created_at);
create index if not exists payment_transitions_order_idx
  on public.payment_transitions (order_id, created_at);

create or replace function public.payment_transitions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payment_transitions est en ajout seul : % interdit', tg_op;
end;
$$;

drop trigger if exists payment_transitions_append_only on public.payment_transitions;
create trigger payment_transitions_append_only
  before update or delete on public.payment_transitions
  for each row execute function public.payment_transitions_append_only();

-- -----------------------------------------------------------------------------
-- 5. entitlements — un accès ouvert par ligne de commande, UNE seule fois
--    (unique) : une confirmation répétée ne crée aucun doublon de droit.
-- -----------------------------------------------------------------------------
create table if not exists public.entitlements (
  id                   uuid primary key default gen_random_uuid(),
  order_item_id        uuid not null unique references public.order_items (id) on delete cascade,
  order_id             uuid not null references public.orders (id) on delete cascade,
  granted_by_payment_id uuid references public.payments (id) on delete set null,
  granted_at           timestamptz not null default now(),
  revoked_at           timestamptz
);
alter table public.entitlements enable row level security;
create index if not exists entitlements_order_idx on public.entitlements (order_id);

-- -----------------------------------------------------------------------------
-- 6. promo_codes — remise pourcentage strictement < 100.
--    (remise fixe ≥ prix = refus : contrôle applicatif dans create_order,
--     le prix n'est pas dans cette table)
-- -----------------------------------------------------------------------------
alter table public.promo_codes
  drop constraint if exists promo_codes_percent_lt_100;
alter table public.promo_codes
  add constraint promo_codes_percent_lt_100
  check (discount_type <> 'percent' or discount_value < 100);

-- -----------------------------------------------------------------------------
-- 7. RLS — refus par défaut ; seules ces politiques ouvrent la lecture.
--    Écriture des deux tables : service-role uniquement (RPC blocs 2/3).
-- -----------------------------------------------------------------------------
create policy payment_transitions_admin_select on public.payment_transitions
  for select to authenticated
  using (public.is_admin());

create policy entitlements_select_own on public.entitlements
  for select to authenticated
  using (public.owns_order(order_id));

create policy entitlements_select_admin on public.entitlements
  for select to authenticated
  using (public.is_admin());

-- GRANTs explicites (auto_expose_new_tables = false) — service_role compris
-- (le « grant all on all tables » de 0002 ne couvre pas les tables créées après).
grant select on public.payment_transitions to authenticated;
grant select on public.entitlements to authenticated;
grant all on public.payment_transitions to service_role;
grant all on public.entitlements to service_role;
