"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * M9a (f) — Consultation EXPLICITE des réponses PAR-Q d'une commande.
 *
 * - rien n'est lu ni affiché au chargement de la page : les réponses ne
 *   vivent que dans l'état du composant, après un clic ;
 * - aucune mise en cache côté navigateur : ni localStorage, ni sessionStorage,
 *   ni URL (l'identifiant de commande est posté dans le corps) ;
 * - un bouton permet de masquer à nouveau les réponses ;
 * - textes via next-intl, composants du design system, focus clavier natif.
 */

type Answers = {
  q1: boolean;
  q2: boolean;
  q3: boolean;
  q4: boolean;
  q5: boolean;
  q6: boolean;
  q7: boolean;
};

export function ParqAnswersButton({ orderId }: { orderId: string }) {
  const t = useTranslations("admin.parq");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [answers, setAnswers] = useState<Answers | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/par-q", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
        cache: "no-store",
      });
      if (!res.ok) {
        setAnswers(null);
        setStatus("error");
        return;
      }
      const data = (await res.json()) as { answers?: Answers };
      if (!data.answers) {
        setAnswers(null);
        setStatus("error");
        return;
      }
      setAnswers(data.answers);
      setStatus("done");
    } catch {
      setAnswers(null);
      setStatus("error");
    }
  }

  function hide() {
    setAnswers(null);
    setStatus("idle");
  }

  const rows = answers
    ? ([
        ["qHeart", answers.q1],
        ["qChestExertion", answers.q2],
        ["qChestRest", answers.q3],
        ["qSyncope", answers.q4],
        ["qJoint", answers.q5],
        ["qMedication", answers.q6],
        ["qOther", answers.q7],
      ] as const)
    : [];

  return (
    <div className="mt-2">
      {status !== "done" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={load}
          disabled={status === "loading"}
        >
          {status === "loading" ? t("loading") : t("view")}
        </Button>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={hide}>
          {t("hide")}
        </Button>
      )}

      {status === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-text">
          {t("error")}
        </p>
      )}

      {status === "done" && answers && (
        <section
          aria-label={t("title")}
          className="mt-3 border border-line bg-surface p-3 rounded-control"
        >
          <h4 className="mb-2 text-xs uppercase tracking-wide text-ink-muted">{t("title")}</h4>
          <dl className="space-y-1">
            {rows.map(([labelKey, value]) => (
              <div key={labelKey} className="flex justify-between gap-4 text-sm">
                <dt className="text-ink-muted">{t(labelKey)}</dt>
                <dd className="font-medium">{value ? t("yes") : t("no")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
