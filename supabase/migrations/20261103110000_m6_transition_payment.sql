-- =============================================================================
-- M6 — RPC transition_payment : point d'entrée UNIQUE des transitions de
-- statut de paiement (bloc 3) + lecture de statut par jeton haché.
--
-- transition_payment (service role uniquement) :
--   * verrouille le paiement (SELECT ... FOR UPDATE) ;
--   * valide la transition autorisée (sinon P4021) ;
--   * journalise dans payment_transitions (append-only) UNE ligne par
--     transition réelle (statut courant = no-op, retour « unchanged ») ;
--   * carte la commande : confirmed → paid, refunded → refunded ;
--   * OUVERTURE DU DROIT : confirmed insère les entitlements (UNIQUE par
--     order_item) — une notification répétée ne crée aucun doublon ;
--   * PLACES (présentiel) : consommation atomique à la confirmation
--     (reserved + 1 si une place reste) ; en dépassement le droit reste
--     ouvert (le paiement est confirmé) et l'écart est audité :
--     audit_logs « capacity_exceeded » + orders.needs_admin_review = true.
--
-- order_status_by_token : lecture par le jeton HACHÉ uniquement — jeton
-- inconnu, expiré ou absent ⇒ NULL (page neutre identique, aucun oracle).
-- renew_order_status_token : renouvellement à la connexion (14 j, configurable).
-- =============================================================================

create or replace function public.transition_payment(
  p_payment_id        uuid,
  p_to_status         text,   -- pending|verifying|confirmed|failed|rejected|refunded
  p_actor_role        text,   -- webhook | admin | system
  p_actor_id          uuid,
  p_reason            text,
  p_provider_event_id text    -- traçabilité (dédoublonnée par payment_events)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment        public.payments%rowtype;
  v_order          public.orders%rowtype;
  v_order_status   text;
  v_granted        integer := 0;
  v_capacity_state text := null;   -- 'consumed' | 'exceeded' | null
  v_slot           public.capacity_slots%rowtype;
begin
  if p_to_status not in ('pending', 'verifying', 'confirmed', 'failed', 'rejected', 'refunded') then
    raise exception 'statut_invalide' using errcode = 'P4019';
  end if;
  if p_actor_role not in ('webhook', 'admin', 'system') then
    raise exception 'acteur_invalide' using errcode = 'P4018';
  end if;

  select * into v_payment from public.payments
    where id = p_payment_id
    for update;
  if not found then
    raise exception 'paiement_inconnu' using errcode = 'P4020';
  end if;

  -- No-op idempotent : notifier une transition déjà appliquée ne crée
  -- ni journal en double, ni recalcul (le webhook est dédoublonné par
  -- payment_events ; ceci est la deuxième ceinture).
  if v_payment.status = p_to_status then
    return jsonb_build_object('payment_id', v_payment.id, 'from', v_payment.status,
      'to', p_to_status, 'order_status', null, 'result', 'unchanged');
  end if;

  -- Transitions autorisées (strict, du plan validé) :
  --   pending   → verifying | confirmed | failed | rejected
  --   verifying → confirmed | failed | rejected
  --   confirmed → refunded
  if not (
       (v_payment.status = 'pending'   and p_to_status in ('verifying', 'confirmed', 'failed', 'rejected'))
    or (v_payment.status = 'verifying' and p_to_status in ('confirmed', 'failed', 'rejected'))
    or (v_payment.status = 'confirmed' and p_to_status = 'refunded')
  ) then
    raise exception 'transition_interdite' using errcode = 'P4021';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id;

  -- 1) Statut commande LAISSÉ / cible (journal : toujours non null) :
  --    confirmed → 'paid' (SAUF commande annulée, voir M9) ;
  --    refunded → 'refunded' ; refus/échec → statut courant inchangé.
  --    Paiement APRÈS annulation (point ouvert M9) : le statut commande
  --    reste « cancelled » — n'ouvre NI droit, NI place ; l'admin décide
  --    d'une réouverture manuelle — mais le journal trace ce qui s'est
  --    réellement passé.
  v_order_status := case p_to_status
                      when 'confirmed' then case when v_order.status = 'cancelled' then 'cancelled' else 'paid' end
                      when 'refunded'  then 'refunded'
                      else v_order.status
                    end;

  -- 2) PLACES : consommation atomique UNIQUEMENT à la confirmation d'une
  --    commande réellement payée (jamais sur une commande annulée).
  if p_to_status = 'confirmed' and v_order_status = 'paid' and v_order.slot_date is not null then
    select * into v_slot from public.capacity_slots
      where offer_id = v_order.offer_id and slot_date = v_order.slot_date
      for update;
    if found then
      -- FOR UPDATE garantit l'exclusion mutuelle ; `reserved < capacity`
      -- est la seule condition de dépassement.
      update public.capacity_slots
        set reserved = reserved + 1
        where id = v_slot.id and reserved < capacity
        returning * into v_slot;
      if found then
        v_capacity_state := 'consumed';
      end if;
    end if;
    if v_capacity_state is null then
      -- Dépassement : le paiement confirmé OUVRE bien le droit (pas de
      -- confiscation d'un paiement validé) ; l'écart est audité et
      -- l'admin arbitre.
      v_capacity_state := 'exceeded';
      update public.orders set needs_admin_review = true where id = v_order.id;
      insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
        values (p_actor_id, p_actor_role, 'capacity_exceeded', 'order', v_order.id::text,
                jsonb_build_object('slot_date', v_order.slot_date, 'offer_id', v_order.offer_id,
                                   'payment_id', v_payment.id));
    end if;
  end if;

  -- 3) Statuts : paiement puis commande ('paid' une SEULE fois — une
  --    re-confirmation est déjà un no-op, retour « unchanged »).
  update public.payments set status = p_to_status where id = v_payment.id;
  if v_order_status <> v_order.status then
    update public.orders set status = v_order_status where id = v_order.id;
  end if;

  -- 4) OUVERTURE DU DROIT (UNIQUE par order_item) — jamais sur annulé.
  if p_to_status = 'confirmed' and v_order_status = 'paid' then
    insert into public.entitlements (order_item_id, order_id, granted_by_payment_id)
    select oi.id, oi.order_id, v_payment.id
      from public.order_items oi
      where oi.order_id = v_order.id
    on conflict (order_item_id) do nothing;
    get diagnostics v_granted = row_count;
  end if;

  -- 5) Journal append-only (une ligne par transition réelle).
  insert into public.payment_transitions
    (payment_id, order_id, from_status, to_status, order_status,
     actor_id, actor_role, reason, provider_event_id)
    values
    (v_payment.id, v_order.id, v_payment.status, p_to_status, v_order_status,
     p_actor_id, p_actor_role, p_reason, p_provider_event_id);

  return jsonb_build_object('payment_id', v_payment.id, 'from', v_payment.status,
    'to', p_to_status, 'order_status', v_order_status, 'result', 'applied',
    'entitlements_granted', v_granted, 'capacity', v_capacity_state);
end;
$$;

-- -----------------------------------------------------------------------------
-- Lecture de statut par jeton HACHÉ (page neutre) :
-- inconnu, expiré, hash mismatch ⇒ NULL, sans différence entre les cas.
-- -----------------------------------------------------------------------------
create or replace function public.order_status_by_token(
  p_status_token_hash text
)
returns table (
  reference            text,
  order_status         text,
  total_da             integer,
  created_at           timestamptz,
  status_token_expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select o.reference, o.status, o.total_da, o.created_at, o.status_token_expires_at
    from public.orders o
    where o.status_token_hash = p_status_token_hash
      and o.status_token_expires_at > now();
$$;

-- Renouvellement du jeton (à la connexion du client) : le VIEUX jeton
-- devient caduc (hash remplacé) — la page neutre reste identique pour
-- un observateur extérieur.
create or replace function public.renew_order_status_token(
  p_order_id           uuid,
  p_new_status_token_hash text,
  p_expires_at         timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_status_token_hash is null or p_expires_at is null then
    raise exception 'jeton_invalide' using errcode = 'P4022';
  end if;
  if p_expires_at < now() then
    raise exception 'jeton_invalide' using errcode = 'P4022';
  end if;
  update public.orders
    set status_token_hash = p_new_status_token_hash,
        status_token_expires_at = p_expires_at
    where id = p_order_id;
  if not found then
    raise exception 'commande_inconnue' using errcode = 'P4020';
  end if;
end;
$$;

-- Exécution réservée au service role (routes serveur uniquement).
revoke execute on function public.transition_payment(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_payment(uuid, text, text, uuid, text, text)
  to service_role;
revoke execute on function public.order_status_by_token(text)
  from public, anon, authenticated;
grant execute on function public.order_status_by_token(text) to service_role;
revoke execute on function public.renew_order_status_token(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.renew_order_status_token(uuid, text, timestamptz)
  to service_role;
