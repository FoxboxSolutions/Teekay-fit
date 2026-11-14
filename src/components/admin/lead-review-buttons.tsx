"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * M9a (c) — décisions de revue d'identité d'un lead `needs_review`.
 * Trois décisions (garder le nom enregistré / utiliser le nom soumis /
 * marquer revu en notant l'autre nom), toutes avec motif obligatoire.
 * Aucune fusion automatique : la décision est humaine et audité côté route.
 */
export function LeadReviewButtons({ leadId }: { leadId: string }) {
  const t = useTranslations("admin.aTraiter");
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  // Après une décision acceptée, la ligne quitte la liste (router.refresh) :
  // la disparition de la ligne EST la confirmation — aucun feedback de succès
  // éphémère (démonté avec le composant, source de course en test).
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "error"; message: string } | null>(null);

  async function decide(decision: "keep_existing" | "use_submitted" | "note_and_close") {
    setFeedback(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setDone(true);
        setReason("");
        // Le lead quittant la liste, on recharge les données serveur.
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: json.error ?? t("reviewFailed") });
      }
    } catch {
      setFeedback({ kind: "error", message: t("reviewFailed") });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        className="border border-ink-muted rounded px-2 py-1 text-xs"
        placeholder={t("reviewReason")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={1000}
        disabled={done}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => decide("keep_existing")} disabled={pending || done || reason.trim().length < 3} size="sm">
          {t("reviewKeep")}
        </Button>
        <Button onClick={() => decide("use_submitted")} disabled={pending || done || reason.trim().length < 3} size="sm">
          {t("reviewUseSubmitted")}
        </Button>
        <Button onClick={() => decide("note_and_close")} disabled={pending || done || reason.trim().length < 3} size="sm">
          {t("reviewNoteClose")}
        </Button>
        {feedback && (
          <span className="text-xs text-red-text">
            {feedback.message}
          </span>
        )}
      </div>
    </div>
  );
}
