-- M9a (ajustements validés) — limite PAR UTILISATEUR pour MFA + sessions admin
-- à durée absolue bornée côté application.
--
-- 1) peek_rate_limit : lit le compteur d'un bucket SANS l'incrémenter
--    (sémantique identique à check_rate_limit — fenêtre glissante sur
--    window_start). Sert à savoir si un compte admin est déjà « bloqué
--    temporairement » AVANT de tenter un code (les échecs seuls
--    incrémentent, via check_rate_limit après chaque échec).
create or replace function public.peek_rate_limit(
  p_bucket text,
  p_window_seconds integer
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_bucket is null or p_window_seconds is null or p_window_seconds < 1 then
    return 0;
  end if;

  select coalesce(hit_count, 0) into v_count
  from public.rate_limit_counters
  where bucket_key = p_bucket
    and window_start >= now() - make_interval(secs => p_window_seconds);
  return v_count;
end;
$$;
revoke execute on function public.peek_rate_limit from public, anon, authenticated;
grant execute on function public.peek_rate_limit to service_role;

-- 2) admin_mfa_sessions : moment (UTC) de la DERNIÈRE vérification TOTP
--    réussie par (utilisateur, session). La page /admin exige une ligne
--    plus récente que la durée absolue (défaut 12 h, configurable) —
--    nouvelle connexion avec MFA après expiration. Sécrit UNIQUEMENT par
--    le serveur (service-role) — aucune politique RLS ; la relance
--    d'activité NE la rafraîchit pas (durée absolue, pas dawdling).
create table public.admin_mfa_sessions (
  user_id        uuid        not null references public.profiles (id) on delete cascade,
  session_id     text        not null,
  mfa_verified_at timestamptz not null default now(),
  primary key (user_id, session_id)
);
alter table public.admin_mfa_sessions enable row level security;
revoke all on public.admin_mfa_sessions from anon, authenticated;
grant select, insert, update, delete on public.admin_mfa_sessions to service_role;
create index admin_mfa_sessions_verified_at_idx on public.admin_mfa_sessions (mfa_verified_at);
