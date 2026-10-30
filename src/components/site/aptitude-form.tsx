"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ContentText } from "@/components/site/content-text";
import { DISCIPLINES } from "@/lib/site/nav-data";

const YES_NO = ["yes", "no"] as const;

const schema = z.object({
  q1: z.enum(YES_NO),
  q2: z.enum(YES_NO),
  q3: z.enum(YES_NO),
  q4: z.enum(YES_NO),
  q5: z.enum(YES_NO),
  q6: z.enum(YES_NO),
  objective: z.string().min(1),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  disciplines: z.array(z.string()).min(1),
  availability: z.string().min(1),
  equipment: z.enum(["gym", "home", "outdoor"]),
  waiver: z.literal(true),
});

const fieldClass =
  "min-h-11 w-full rounded-control border border-line-input bg-surface px-3 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright";

function RadioRow({
  name,
  value,
  label,
}: {
  name: string;
  value: string;
  label: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-ink-muted">
      <input
        type="radio"
        name={name}
        value={value}
        className="size-5 shrink-0 accent-red-lux"
      />
      {label}
    </label>
  );
}

/**
 * Questionnaire d'aptitude (PAR-Q) et décharge — UI et validation zod uniquement,
 * sans écriture en base (M6 branchera l'enregistrement). Aucune persistance :
 * ni localStorage, ni sessionStorage, ni URL, ni appel réseau à la saisie.
 * Jamais de texte libre pour la santé (choix structurés oui/non uniquement).
 */
export function AptitudeForm() {
  const t = useTranslations("questionnaire");
  const tn = useTranslations("nav");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const data = {
      q1: fd.get("q1"),
      q2: fd.get("q2"),
      q3: fd.get("q3"),
      q4: fd.get("q4"),
      q5: fd.get("q5"),
      q6: fd.get("q6"),
      objective: fd.get("objective") ?? "",
      experience: fd.get("experience") ?? "",
      disciplines: fd.getAll("disciplines").map(String),
      availability: fd.get("availability") ?? "",
      equipment: fd.get("equipment") ?? "",
      waiver: fd.get("waiver") === "on",
    };
    const parsed = schema.safeParse(data);
    if (parsed.success) {
      setError(false);
      setSubmitted(true);
      // Aucune persistance ni envoi réseau à ce stade (M6).
    } else {
      setError(true);
      setSubmitted(false);
    }
  }

  if (submitted) {
    return (
      <div
        role="status"
        className="rounded-card border border-line bg-surface p-6 text-ink"
      >
        {t("success")}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      {/* PAR-Q */}
      <fieldset className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6">
        <legend className="px-2 font-display text-xl font-bold uppercase">{t("parqTitle")}</legend>
        <p className="text-sm text-ink-muted">{t("parqGuidance")}</p>
        {(["q1", "q2", "q3", "q4", "q5", "q6"] as const).map((q) => (
          <div key={q} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
            <p className="text-ink">{t(q)}</p>
            <div className="mt-1 flex gap-6">
              <RadioRow name={q} value="yes" label={t("yes")} />
              <RadioRow name={q} value="no" label={t("no")} />
            </div>
          </div>
        ))}
      </fieldset>

      {/* Objectif */}
      <div className="flex flex-col gap-2">
        <label htmlFor="apt-objective" className="text-sm font-medium text-ink">
          {t("objectiveLabel")}
        </label>
        <select id="apt-objective" name="objective" required className={fieldClass} defaultValue="">
          <option value="" disabled></option>
          <option value="poids">{t("objective.poids")}</option>
          <option value="muscle">{t("objective.muscle")}</option>
          <option value="performance">{t("objective.performance")}</option>
          <option value="competition">{t("objective.competition")}</option>
          <option value="forme">{t("objective.forme")}</option>
        </select>
      </div>

      {/* Expérience */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">{t("experienceLabel")}</legend>
        <RadioRow name="experience" value="beginner" label={t("experience.beginner")} />
        <RadioRow name="experience" value="intermediate" label={t("experience.intermediate")} />
        <RadioRow name="experience" value="advanced" label={t("experience.advanced")} />
      </fieldset>

      {/* Disciplines */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">{t("disciplinesLabel")}</legend>
        {DISCIPLINES.map((d) => (
          <label key={d.slug} className="flex min-h-11 cursor-pointer items-center gap-3 text-ink-muted">
            <Checkbox name="disciplines" value={d.slug} className="size-5" />
            {tn(`disciplinesList.${d.key}`)}
          </label>
        ))}
      </fieldset>

      {/* Disponibilité */}
      <div className="flex flex-col gap-2">
        <label htmlFor="apt-availability" className="text-sm font-medium text-ink">
          {t("availabilityLabel")}
        </label>
        <select id="apt-availability" name="availability" required className={fieldClass} defaultValue="">
          <option value="" disabled></option>
          <option value="s23">{t("availability.s23")}</option>
          <option value="s45">{t("availability.s45")}</option>
          <option value="s6">{t("availability.s6")}</option>
        </select>
      </div>

      {/* Environnement */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">{t("equipmentLabel")}</legend>
        <RadioRow name="equipment" value="gym" label={t("equipment.gym")} />
        <RadioRow name="equipment" value="home" label={t("equipment.home")} />
        <RadioRow name="equipment" value="outdoor" label={t("equipment.outdoor")} />
      </fieldset>

      {/* Décharge */}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-ink-muted">
        <Checkbox name="waiver" className="mt-0.5 size-5" />
        <ContentText text={t("waiverLabel")} />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-text">
          {t("errorSummary")} {t("waiverError")}
        </p>
      )}

      <div>
        <Button type="submit" variant="primary">
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
