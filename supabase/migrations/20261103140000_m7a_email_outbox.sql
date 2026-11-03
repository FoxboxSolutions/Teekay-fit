-- ============================================================================
-- M7a (bloc 5) — Outbox e-mail : idempotence des notifications client.
-- Une seule ligne par (payment_id, event_type) : la confirmation d'un
-- paiement (acteur admin, acteur webhook M7b) déclenche l'e-mail UNE SEULE
-- FOIS même en cas de rejeu de la route. Le contenu n'est PAS stocké (jamais
-- de jeton brut en base — le lien de suivi est régénéré via
-- renew_order_status_token par le serveur au moment de l'envoi).
-- ============================================================================

create table public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payments (id) on delete cascade,
  event_type  text not null check (event_type in ('payment_confirmed','payment_rejected')),
  recipient   text not null,
  status      text not null default 'queued' check (status in ('queued','sent','failed')),
  attempts    integer not null default 0 check (attempts between 0 and 10),
  sent_at     timestamptz,
  last_error  text,
  created_at  timestamptz not null default now(),
  unique (payment_id, event_type)
);

create index email_outbox_status_idx on public.email_outbox (status)
  where status = 'queued';

alter table public.email_outbox enable row level security;

-- Lecture/écriture : service role uniquement (routes serveur). Aucune
-- politique RLS ⇒ refus par défaut pour anon/authenticated ; aucun client
-- ne lit jamais la boîte d'envoi (adresse e-mail, statut d'envoi).

-- AUCUN grant pour anon/authenticated (idem M6/M7a : tables postérieures à
-- 0002 → grants explicites) ; le service role a le grant intégral.
grant all on public.email_outbox to service_role;

comment on table public.email_outbox is
  'Outbox e-mail transactionnel : idempotence par (payment_id, event_type). '
  'Le contenu n''est jamais stocké (jeton brut interdit en base). '
  'Envoi : service role via le provider configurable (MAILER_PROVIDER).';
