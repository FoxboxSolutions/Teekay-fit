-- =============================================================================
-- M5 — Fonction de soumission ATOMIQUE (ajout #1 au plan)
--
-- Dans UNE transaction : upsert du lead par phone_norm + insertion de la
-- soumission de quiz + insertion des consentements. Une erreur au milieu
-- annule tout (ni lead sans consentement, ni consentement orphelin).
--
-- SECURITY DEFINER, search_path fixé, exécution réservée au service role
-- (les routes API l'appellent avec le client service-role ; un visiteur
-- anonyme ne peut ni lire ni écrire les leads directement — RLS admin-seul).
-- =============================================================================

create or replace function public.submit_lead(
  p_name                      text,
  p_phone                     text,
  p_phone_norm                text,
  p_email                     text,
  p_goal                      text,
  p_offer_slug                text,
  p_source                    text,          -- 'quiz' | 'contact'
  p_answers                   jsonb,         -- réponses quiz (null pour contact)
  p_recommended_slug          text,          -- recalculé côté serveur
  p_result_token_hash         text,          -- jeton haché (null pour contact)
  p_result_token_expires_at   timestamptz,   -- expiration 72 h (null pour contact)
  p_consent_recontact_version text,          -- requis
  p_consent_marketing_version text,          -- null = pas de marketing
  p_consent_age18_version     text           -- requis
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  -- Défense en profondeur : pas de lead sans consentements obligatoires.
  if p_consent_recontact_version is null or p_consent_age18_version is null then
    raise exception 'consentement_obligatoire_manquant';
  end if;
  if p_source not in ('quiz', 'contact') then
    raise exception 'source_invalide';
  end if;
  if p_source = 'quiz' and p_answers is null then
    raise exception 'quiz_sans_reponses';
  end if;

  if p_phone_norm is not null then
    -- Détection de doublon par numéro normalisé (index unique partiel).
    insert into public.leads
      (name, phone, phone_norm, email, goal, offer_slug, source,
       consent, consent_at, submitted_name, needs_review)
    values
      (p_name, p_phone, p_phone_norm, p_email, p_goal, p_offer_slug, p_source,
       true, now(), null, false)
    on conflict (phone_norm) where phone_norm is not null
    do update set
      email       = coalesce(excluded.email, public.leads.email),
      goal        = coalesce(excluded.goal, public.leads.goal),
      offer_slug  = coalesce(excluded.offer_slug, public.leads.offer_slug),
      phone       = coalesce(excluded.phone, public.leads.phone),
      -- Ne JAMAIS écraser notes ; garder l'ancien nom du lead.
      submitted_name = case
        when excluded.name is distinct from public.leads.name then excluded.name
        else public.leads.submitted_name end,
      needs_review = case
        when excluded.name is distinct from public.leads.name then true
        else public.leads.needs_review end,
      consent     = true,
      consent_at  = now(),
      updated_at  = now()
    returning id into v_lead_id;
  else
    -- Pas de téléphone : pas de détection de doublon possible → nouvel enregistrement.
    insert into public.leads
      (name, phone, phone_norm, email, goal, offer_slug, source,
       consent, consent_at, submitted_name, needs_review)
    values
      (p_name, p_phone, null, p_email, p_goal, p_offer_slug, p_source,
       true, now(), null, false)
    returning id into v_lead_id;
  end if;

  -- Soumission de quiz (uniquement pour le quiz) : nom soumis + jeton de résultat.
  if p_source = 'quiz' then
    insert into public.quiz_submissions
      (lead_id, answers, recommended_offer_slug, submitted_name,
       result_token_hash, result_token_expires_at, started_at, completed_at)
    values
      (v_lead_id, p_answers, p_recommended_slug, p_name,
       p_result_token_hash, p_result_token_expires_at, now(), now());
  end if;

  -- Consentements (version + horodatage) : recontact et 18+ requis,
  -- marketing optionnel (ligne créée seulement si coché).
  insert into public.consents (consent_type, version, lead_id)
  values ('recontact', p_consent_recontact_version, v_lead_id);

  if p_consent_marketing_version is not null then
    insert into public.consents (consent_type, version, lead_id)
    values ('marketing', p_consent_marketing_version, v_lead_id);
  end if;

  insert into public.consents (consent_type, version, lead_id)
  values ('age_18', p_consent_age18_version, v_lead_id);

  return v_lead_id;
end;
$$;

-- Exécution réservée au service role (les routes serveur uniquement).
revoke execute on function public.submit_lead(text, text, text, text, text, text,
  text, jsonb, text, text, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_lead(text, text, text, text, text, text,
  text, jsonb, text, text, timestamptz, text, text, text)
  to service_role;
