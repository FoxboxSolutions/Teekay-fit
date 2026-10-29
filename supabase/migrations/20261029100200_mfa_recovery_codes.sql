-- =============================================================================
-- M2 · Codes de secours MFA (admin) — hash uniquement, jamais le code en clair.
-- Lecture/écriture : service-role uniquement (route serveur d'activation MFA).
-- RLS activée à la création, aucune politique client → refus par défaut.
-- =============================================================================
create table public.mfa_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  code_hash   text not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  check (used_at is null or used_at >= created_at)
);
create index mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id)
  where used_at is null;
alter table public.mfa_recovery_codes enable row level security;

comment on table public.mfa_recovery_codes is
  'Codes de secours MFA admin : hash SHA-256 du code, utilisables une seule fois '
  '(unenroll du facteur TOTP si téléphone perdu). Aucune politique client — '
  'service-role uniquement. Procédure : docs/admin-mfa-recovery.md.';

grant select, insert, update on public.mfa_recovery_codes to service_role;
