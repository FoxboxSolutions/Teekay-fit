-- ============================================================================
-- M7a (bloc 2) — Preuves de paiement BaridiMob (référence de transaction +
-- capture optionnelle). Captures : images (jpeg/png/webp), taille max 5 Mo,
-- EXIF retiré par ré-encodage côté serveur, nom de fichier regénéré, stockage
-- PRIVÉ ; lecture admin uniquement via lien signé court (côté serveur).
-- ============================================================================

create table if not exists public.payment_proofs (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references public.payments (id) on delete cascade,
  order_id       uuid not null references public.orders (id) on delete cascade,
  txn_reference  text not null check (char_length(txn_reference) between 6 and 60),
  object_path    text,   -- null = preuve sans capture (référence seule)
  mime_type      text check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes     integer check (size_bytes between 1 and 5 * 1024 * 1024),
  created_at     timestamptz not null default now()
);

-- Détection « même référence de transaction sur deux commandes » : la
-- référence n'est PAS unique (c'est précisément le signalement admin qui la
-- traite), indexée pour la recherche admin.
create index payment_proofs_txn_reference_idx on public.payment_proofs (txn_reference);
create index payment_proofs_payment_idx on public.payment_proofs (payment_id);

alter table public.payment_proofs enable row level security;

-- Lecture admin uniquement (détail de vérification) ; l'écriture passe par le
-- serveur (service role) ; un client ne lit jamais les preuves d'un autre.
create policy payment_proofs_admin_select on public.payment_proofs
  for select to authenticated
  using (is_admin());

-- AUCUN grant pour anon (idem M6 : tables postérieures → grants explicites) ;
-- le service role a le grant intégral pour toute l'écriture serveur.
grant all on public.payment_proofs to service_role;
grant select on public.payment_proofs to authenticated;

-- ----------------------------------------------------------------------------
-- Bucket privé « payment-proofs » : aucun upload direct possible (le client
-- passe par la route serveur), aucune policy de lecture directe — la lecture
-- admin passe par des URLs signées créées côté serveur (courte durée).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false, 5 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5 * 1024 * 1024,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];
