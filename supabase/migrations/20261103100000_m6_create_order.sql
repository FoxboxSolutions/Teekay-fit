-- =============================================================================
-- M6 — RPC create_order : création de commande transactionnelle (bloc 2)
--
-- Dans UNE transaction (une erreur au milieu annule tout) :
--   * validation serveur de l'offre active (prix jamais du navigateur) ;
--   * e-mail obligatoire (décision tranchée) ;
--   * client upserté par e-mail (index unique partiel ci-dessous) ;
--   * référence TKF-AAMM-XXXX : suffixe aléatoire sans 0/O/1/I/L,
--     unicité garantie par réessai ;
--   * idempotence : même clé + même hash de contenu ⇒ commande d'origine
--     retournée (sans re-consommer le code promo, sans doublon d'enfant) ;
--     même clé + hash différent ⇒ P4096 « idempotency_conflict » (HTTP 409) ;
--   * code promo : fenêtre/offre/actif, plafond < 100 % (contrainte SQL),
--     remise fixe ≥ prix = refus, arrondi UNIQUE en entier de DA
--     (demi-DA vers le haut, favorable au client), total final ≥ 1 DA,
--     max_uses consommé ATOMIQUEMENT (update conditionnel) ;
--   * présentiel : date de séance requise, refus neutre « complet » si
--     reserved >= capacity (les places se consomment à la confirmation) ;
--   * coaching : PAR-Q structuré (7 booléens, aucun texte libre) + décharge
--     acceptée, drapeau « avis médical conseillé » calculé côté serveur,
--     conservation 24 mois (purge_expired_health_data) ;
--   * consentements (conditions, confidentialité, remboursement [+ avis
--     médical]) versionnés et horodatés par la table consents ;
--   * paiement « pending » créé pour le fournisseur choisi.
--
-- SECURITY DEFINER, search_path fixé, exécution réservée au service role :
-- les routes serveur l'appellent avec le client service-role ; anonyme et
-- visiteur connecté ne peuvent ni lire ni écrire les commandes directement.
-- =============================================================================

-- Client identifiable par e-mail : un e-mail = un client (fusion par revue
-- humaine uniquement, jamais automatique — cohérence avec les leads M5).
create unique index if not exists customers_email_unique
  on public.customers (email)
  where email is not null;

-- Date de séance (présentiel) et drapeau « à revoir par l'admin » (dépassement
-- de places à la confirmation : le droit reste ouvert, l'admin arbitre).
alter table public.orders
  add column if not exists slot_date date,
  add column if not exists needs_admin_review boolean not null default false;

create or replace function public.create_order(
  p_idempotency_key          text,
  p_request_hash             text,   -- hash SHA-256 du contenu canonique (côté serveur)
  p_status_token_hash        text,   -- jeton de statut ≥128 bits, haché
  p_status_token_expires_at  timestamptz,
  p_offer_slug               text,
  p_name                     text,
  p_email                    text,
  p_phone                    text,
  p_phone_norm               text,
  p_provider                 text,   -- slickpay | chargily | manual | fake
  p_payment_method           text,   -- null pour les fournisseurs en ligne
  p_promo_code               text,
  p_slot_date                date,   -- présentiel uniquement
  p_aptitude                 jsonb,  -- { q1..q7 bool , objective, experience_level } (coaching)
  p_waiver_version           text,   -- version de la décharge santé (coaching)
  p_consent_terms_version    text,
  p_consent_privacy_version  text,
  p_consent_refunds_version  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet   constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_offer      public.offers%rowtype;
  v_offer_type text;
  v_customer_id uuid;
  v_promo      public.promo_codes%rowtype;
  v_promo_id   uuid;
  v_discount   integer;
  v_total      integer;
  v_cap        integer;
  v_reserved   integer;
  v_used       integer;
  v_order_id   uuid;
  v_reference  text;
  v_suffix     text;
  v_existing   public.orders%rowtype;
  v_constraint text;
  v_i          integer;
  v_is_coaching boolean;
begin
  -- 0) Garde-fous d'entrée -------------------------------------------------
  if p_email is null or btrim(p_email) = '' then
    raise exception 'email_obligatoire' using errcode = 'P4001';
  end if;
  if p_provider not in ('slickpay', 'chargily', 'manual', 'fake') then
    raise exception 'provider_invalide' using errcode = 'P4002';
  end if;
  if p_request_hash is null or p_status_token_hash is null
     or p_status_token_expires_at is null then
    raise exception 'signatures_manquantes' using errcode = 'P4003';
  end if;

  -- 1) Offre : le prix vient de la base, jamais du navigateur ---------------
  select * into v_offer from public.offers
    where slug = p_offer_slug and is_active is true;
  if not found then
    raise exception 'offre_inconnue' using errcode = 'P4004';
  end if;
  v_offer_type  := v_offer.offer_type;
  v_is_coaching := v_offer_type in ('coaching_online', 'coaching_in_person');

  -- 2) Coaching : PAR-Q structuré + décharge obligatoires -------------------
  if v_is_coaching then
    if p_aptitude is null
       or (p_aptitude ->> 'q1') is null or (p_aptitude ->> 'q2') is null
       or (p_aptitude ->> 'q3') is null or (p_aptitude ->> 'q4') is null
       or (p_aptitude ->> 'q5') is null or (p_aptitude ->> 'q6') is null
       or (p_aptitude ->> 'q7') is null
       or p_waiver_version is null then
      raise exception 'par_q_manquant' using errcode = 'P4005';
    end if;
    if (p_aptitude ->> 'objective') not in
         ('strength', 'endurance', 'weight_loss', 'performance', 'hybrid')
       or (p_aptitude ->> 'experience_level') not in
         ('beginner', 'intermediate', 'advanced') then
      raise exception 'par_q_invalide' using errcode = 'P4006';
    end if;
  end if;

  -- 3) Présentiel : séance datée, refus neutre « complet » ------------------
  --    Les places ne se consomment qu'à la confirmation (bloc 4, « reserved »
  --    incrémenté atomiquement au paiement confirmé) ; à la création, on
  --    refuse simplement une commande sur une séance déjà pleine.
  if v_offer_type = 'coaching_in_person' then
    if p_slot_date is null then
      raise exception 'slot_requis' using errcode = 'P4007';
    end if;
    select capacity, reserved into v_cap, v_reserved
      from public.capacity_slots
      where offer_id = v_offer.id and slot_date = p_slot_date
      for update;
    if not found or v_reserved >= v_cap then
      raise exception 'complet' using errcode = 'P4090';
    end if;
  end if;

  -- 4) Code promo : validation + calcul (arrondi UNIQUE en entier DA) -------
  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    select * into v_promo from public.promo_codes
      where code = upper(btrim(p_promo_code))
        and is_active is true
        and (valid_from is null or valid_from <= now())
        and (valid_until is null or valid_until > now())
        and (offer_id is null or offer_id = v_offer.id);
    if not found then
      raise exception 'promo_invalide' using errcode = 'P4008';
    end if;
    if v_promo.discount_type = 'percent' then
      -- Règle d'arrondi unique (décision amendement 7) : remise = round demi-DA
      -- vers le haut — un seul arrondi, en entier de DA, formulé en valeur
      -- exacte : price × tous calculs en NUMERIC puis ROUND() (demi supérieur),
      -- JAMAIS de flottant (0,1 binaire) ni de troncature.
      v_discount := round(v_offer.price_da * v_promo.discount_value / 100.0);
    else
      v_discount := v_promo.discount_value;
    end if;
    -- Remise ≥ prix = refus (fixe explicite, ou % arrondi qui couvre le prix).
    if v_discount >= v_offer.price_da then
      raise exception 'remise_trop_grande' using errcode = 'P4010';
    end if;
    v_total := v_offer.price_da - v_discount;
    if v_total < 1 then
      raise exception 'total_invalide' using errcode = 'P4011';
    end if;
    v_promo_id := v_promo.id;
  else
    v_discount := 0;
    v_total    := v_offer.price_da;
  end if;

  -- 5) Client par e-mail (upsert — le même e-mail réutilise sa fiche) -------
  insert into public.customers (name, phone, phone_norm, email)
    values (p_name, p_phone, p_phone_norm, btrim(p_email))
    on conflict (email) where public.customers.email is not null do update
      set name       = excluded.name,
          phone      = coalesce(excluded.phone, public.customers.phone),
          phone_norm = coalesce(excluded.phone_norm, public.customers.phone_norm)
    returning id into v_customer_id;

  -- 6) Commande : référence unique par réessai + idempotence ---------------
  v_order_id := null;
  loop
    v_suffix := '';
    for v_i in 1..4 loop
      v_suffix := v_suffix || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    v_reference := 'TKF-' || to_char(now(), 'YYMM') || '-' || v_suffix;

    begin
      insert into public.orders
        (reference, customer_id, status, offer_id, offer_slug, offer_name,
         unit_price_da, discount_da, total_da, currency, payment_method,
         promo_code_id, idempotency_key, request_hash, status_token_hash,
         status_token_expires_at, slot_date)
      values
        (v_reference, v_customer_id, 'pending_payment', v_offer.id, v_offer.slug,
         v_offer.name, v_offer.price_da, v_discount, v_total, 'DA',
         p_payment_method, v_promo_id, p_idempotency_key, p_request_hash,
         p_status_token_hash, p_status_token_expires_at, p_slot_date)
      returning id into v_order_id;
      exit;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'orders_reference_key' then
          -- Collision de référence (aléatoire) : simple réessai.
          continue;
        elsif v_constraint = 'orders_idempotency_key_unique' then
          -- Rejeu concurrent : comparer le hash du contenu.
          select * into v_existing from public.orders
            where idempotency_key = p_idempotency_key;
          if v_existing.request_hash is distinct from p_request_hash then
            raise exception 'idempotency_conflict' using errcode = 'P4096';
          end if;
          return jsonb_build_object(
            'order_id',   v_existing.id,
            'reference',  v_existing.reference,
            'total_da',   v_existing.total_da,
            'discount_da', v_existing.discount_da,
            'status_token_expires_at', v_existing.status_token_expires_at,
            'duplicated', true);
        else
          raise;
        end if;
    end;
  end loop;

  -- 7) max_uses : consommation atomique (dernier incrément gagne) -----------
  if v_promo_id is not null then
    update public.promo_codes
      set used_count = used_count + 1
      where id = v_promo_id
        and (max_uses is null or used_count < max_uses)
      returning used_count into v_used;
    if v_used is null then
      -- Refus FINAL : tout rollback (commande incluse), remise de la séance.
      raise exception 'promo_epuisee' using errcode = 'P4102';
    end if;
  end if;

  -- 8) Enfants : ligne figée + paiement pending + PAR-Q + consentements -----
  insert into public.order_items
    (order_id, offer_id, offer_slug, offer_name, unit_price_da, quantity,
     subtotal_da, inclusions, conditions)
    values
    (v_order_id, v_offer.id, v_offer.slug, v_offer.name, v_offer.price_da, 1,
     v_offer.price_da, v_offer.inclusions, v_offer.conditions);

  insert into public.payments
    (order_id, provider, amount_da, method, status)
    values
    (v_order_id, p_provider, v_total, p_payment_method, 'pending');

  if v_is_coaching then
    insert into public.aptitude_questionnaires
      (order_id, customer_id, q1_heart_condition, q2_exertion_chest_pain,
       q3_rest_chest_pain, q4_syncope, q5_joint_bone_problem,
       q6_heart_medication, q7_other_restriction,
       medical_advice_recommended, objective, experience_level,
       waiver_accepted, waiver_accepted_at, waiver_version)
      values
      (v_order_id, v_customer_id,
       (p_aptitude ->> 'q1')::boolean, (p_aptitude ->> 'q2')::boolean,
       (p_aptitude ->> 'q3')::boolean, (p_aptitude ->> 'q4')::boolean,
       (p_aptitude ->> 'q5')::boolean, (p_aptitude ->> 'q6')::boolean,
       (p_aptitude ->> 'q7')::boolean,
       -- Drapeau UNIQUEMENT (aucun diagnostic) : au moins un « oui » ⇒ avis.
       (p_aptitude ->> 'q1')::boolean or (p_aptitude ->> 'q2')::boolean
         or (p_aptitude ->> 'q3')::boolean or (p_aptitude ->> 'q4')::boolean
         or (p_aptitude ->> 'q5')::boolean or (p_aptitude ->> 'q6')::boolean
         or (p_aptitude ->> 'q7')::boolean,
       p_aptitude ->> 'objective', p_aptitude ->> 'experience_level',
       true, now(), p_waiver_version);
  end if;

  insert into public.consents (consent_type, version, order_id)
    values
      ('terms',   p_consent_terms_version,   v_order_id),
      ('privacy', p_consent_privacy_version, v_order_id),
      ('refunds', p_consent_refunds_version, v_order_id);
  if v_is_coaching then
    insert into public.consents (consent_type, version, order_id)
      values ('health_waiver', p_waiver_version, v_order_id);
  end if;

  return jsonb_build_object(
    'order_id',   v_order_id,
    'reference',  v_reference,
    'total_da',   v_total,
    'discount_da', v_discount,
    'status_token_expires_at', p_status_token_expires_at,
    'duplicated', false);
end;
$$;

-- Exécution réservée au service role (routes serveur uniquement).
revoke execute on function public.create_order(text, text, text, timestamptz,
  text, text, text, text, text, text, text, text, date, jsonb, text, text,
  text, text)
  from public, anon, authenticated;
grant execute on function public.create_order(text, text, text, timestamptz,
  text, text, text, text, text, text, text, text, date, jsonb, text, text,
  text, text)
  to service_role;
