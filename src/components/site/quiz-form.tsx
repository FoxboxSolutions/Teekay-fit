"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/site/turnstile";
import { trackEvent } from "@/lib/telemetry/client";
import {
  BUDGETS,
  DISPOS,
  MATERIELS,
  OBJECTIFS,
  NIVEAUX,
  PREFERENCES,
  QUIZ_FIELDS,
  type QuizAnswers,
  type QuizField,
} from "@/lib/quiz/schema";

const STORAGE_KEY = "teekayfit.quiz.v1";
const QUESTION_FIELDS = QUIZ_FIELDS;
const CONTACT_STEP = QUESTION_FIELDS.length;

const OPTIONS: Record<QuizField, readonly string[]> = {
  objectif: OBJECTIFS,
  niveau: NIVEAUX,
  dispo: DISPOS,
  materiel: MATERIELS,
  preference: PREFERENCES,
  budget: BUDGETS,
};

type ErrorKey = "captcha" | "rateLimited" | "invalid" | "network";

interface SavedQuizState {
  step?: number;
  answers?: Partial<QuizAnswers>;
}

/**
 * Quiz « Trouve ton programme » (PRD §7) : une question à la fois, reprise
 * après rechargement (seulement les réponses — jamais nom/téléphone — dans
 * sessionStorage), clavier complet, soumission à /api/quiz/submit puis
 * redirection vers /results/<jeton>.
 */
export function QuizForm() {
  const t = useTranslations("quiz");
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({});
  const [stepError, setStepError] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [consentRecontact, setConsentRecontact] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [consentAge18, setConsentAge18] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<{ name?: boolean; phone?: boolean; consents?: boolean }>({});
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstFocus = useRef(true);
  const startedTracked = useRef(false);
  const completedTracked = useRef(false);

  // Événements produit sans PII (une seule fois par session de quiz).
  function trackStart() {
    if (!startedTracked.current) {
      startedTracked.current = true;
      trackEvent("quiz_start");
    }
  }

  function trackComplete() {
    if (!completedTracked.current) {
      completedTracked.current = true;
      trackEvent("quiz_complete");
    }
  }

  // Reprise après rechargement : réponses + étape (aucune donnée personnelle).
  // setState dans l'effet = seul moyen sûr de lire sessionStorage sans
  // mismatch d'hydratation (SSR sans accès au stockage).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedQuizState;
        if (saved.answers && typeof saved.answers === "object") {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- restauration post-hydration (voir commentaire ci-dessus)
          setAnswers(saved.answers);
        }
        if (
          typeof saved.step === "number" &&
          Number.isInteger(saved.step) &&
          saved.step >= 0 &&
          saved.step <= CONTACT_STEP
        ) {
          setStep(saved.step);
        }
      }
    } catch {
      // Stockage indisponible : on repart de zéro, sans blocage.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, answers }));
    } catch {
      // Quota/privacité : la progression reste en mémoire seulement.
    }
  }, [hydrated, step, answers]);

  // Focus sur le titre du nouveau pas (pas au premier rendu — pas de vol de focus).
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  function choose(field: QuizField, value: string) {
    trackStart();
    setStepError(false);
    setAnswers((prev) => ({ ...prev, [field]: value }) as Partial<QuizAnswers>);
  }

  function goBack() {
    setStepError(false);
    setErrorKey(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function goNext() {
    const field = QUESTION_FIELDS[step];
    if (!field) return;
    if (field !== "budget" && !answers[field]) {
      setStepError(true);
      return;
    }
    setStepError(false);
    if (step === QUESTION_FIELDS.length - 1) trackComplete();
    setStep((s) => Math.min(CONTACT_STEP, s + 1));
  }

  function skipOptional() {
    setStepError(false);
    trackComplete();
    setStep(CONTACT_STEP);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = {
      name: name.trim().length < 2,
      phone: phone.trim().length < 6,
      consents: !consentRecontact || !consentAge18,
    };
    setFieldErrors(errors);
    if (errors.name || errors.phone || errors.consents) return;

    const incomplete = QUESTION_FIELDS.some(
      (field) => field !== "budget" && !answers[field],
    );
    if (incomplete) {
      setErrorKey("invalid");
      return;
    }

    setSubmitting(true);
    setErrorKey(null);
    try {
      const response = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          answers,
          consentRecontact,
          consentMarketing,
          consentAge18,
          turnstileToken,
          website: honeypot,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { resultToken?: string };
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // rien à nettoyer
        }
        if (data.resultToken) {
          router.push(`/results/${data.resultToken}`);
          return;
        }
        setErrorKey("invalid");
        return;
      }

      if (response.status === 429) setErrorKey("rateLimited");
      else if (response.status === 403) setErrorKey("captcha");
      else setErrorKey("invalid");
    } catch {
      setErrorKey("network");
    } finally {
      setSubmitting(false);
    }
  }

  const field = QUESTION_FIELDS[step];

  if (field) {
    const isOptional = field === "budget";
    return (
      <section aria-labelledby="quiz-step-heading" className="flex flex-col">
        <p className="text-sm uppercase tracking-widest text-red-bright">
          {t("progress", { current: step + 1, total: QUESTION_FIELDS.length })}
        </p>
        <h2
          id="quiz-step-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 font-display text-2xl font-bold uppercase focus:outline-none"
        >
          {t(`questions.${field}`)}
        </h2>
        {isOptional && <p className="mt-2 text-sm text-ink-muted">{t("budgetHint")}</p>}

        <fieldset className="mt-6">
          <legend className="sr-only">{t(`questions.${field}`)}</legend>
          <div className="flex flex-col">
            {OPTIONS[field].map((value) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-3 text-ink-muted"
              >
                <input
                  type="radio"
                  name={`quiz-${field}`}
                  value={value}
                  checked={answers[field] === value}
                  onChange={() => choose(field, value)}
                  className="size-5 shrink-0 accent-red-lux"
                />
                {t(`options.${field}.${value}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {stepError && (
          <p role="alert" className="mt-4 text-sm text-red-text">
            {t("errorChoose")}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          {step > 0 && (
            <Button type="button" variant="secondary" onClick={goBack}>
              {t("back")}
            </Button>
          )}
          <Button type="button" variant="primary" onClick={goNext}>
            {t("next")}
          </Button>
          {isOptional && (
            <Button type="button" variant="ghost" onClick={skipOptional}>
              {t("skip")}
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="quiz-step-heading" className="flex flex-col">
      <p className="text-sm uppercase tracking-widest text-red-bright">{t("contactStep.kicker")}</p>
      <h2
        id="quiz-step-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-2 font-display text-2xl font-bold uppercase focus:outline-none"
      >
        {t("contactStep.heading")}
      </h2>
      <p className="mt-2 text-ink-muted">{t("contactStep.intro")}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-5">
        <Field
          htmlFor="quiz-name"
          label={t("contactStep.nameLabel")}
          error={fieldErrors.name ? t("contactStep.nameError") : undefined}
        >
          <Input
            id="quiz-name"
            name="name"
            type="text"
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          htmlFor="quiz-phone"
          label={t("contactStep.phoneLabel")}
          error={fieldErrors.phone ? t("contactStep.phoneError") : undefined}
        >
          <Input
            id="quiz-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+213 5.. .. .. .."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field htmlFor="quiz-email" label={t("contactStep.emailLabel")}>
          <Input
            id="quiz-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        {/* Honeypot : invisible pour un humain, rempli par les robots. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="quiz-website">{t("contactStep.honeypotLabel")}</label>
          <input
            id="quiz-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-ink-muted">
            <Checkbox
              checked={consentRecontact}
              onCheckedChange={(v) => setConsentRecontact(v === true)}
              className="mt-0.5 size-5"
            />
            <span>{t("contactStep.consentRecontact")}</span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-ink-muted">
            <Checkbox
              checked={consentMarketing}
              onCheckedChange={(v) => setConsentMarketing(v === true)}
              className="mt-0.5 size-5"
            />
            <span>{t("contactStep.consentMarketing")}</span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-ink-muted">
            <Checkbox
              checked={consentAge18}
              onCheckedChange={(v) => setConsentAge18(v === true)}
              className="mt-0.5 size-5"
            />
            <span>{t("contactStep.consentAge18")}</span>
          </label>
        </div>
        {fieldErrors.consents && (
          <p role="alert" className="text-sm text-red-text">
            {t("contactStep.consentError")}
          </p>
        )}

        <Turnstile
          onToken={setTurnstileToken}
          label={t("contactStep.captchaLabel")}
          errorLabel={t("contactStep.captchaError")}
        />

        {errorKey && (
          <p role="alert" className="text-sm text-red-text">
            {t(`errors.${errorKey}`)}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={goBack} disabled={submitting}>
            {t("back")}
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? t("contactStep.sending") : t("contactStep.submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
