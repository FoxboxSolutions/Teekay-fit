"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  phone_norm: string | null;
  email: string | null;
  goal: string | null;
  offer_slug: string;
  source: string;
  status: string;
  owner_id: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  consent: boolean;
  consent_at: string | null;
  created_at: string;
  updated_at: string;
};

const PIPELINE: { value: string; labelKey: string }[] = [
  { value: "new", labelKey: "statusNew" },
  { value: "contacted", labelKey: "statusContacted" },
  { value: "interested", labelKey: "statusInterested" },
  { value: "follow_up", labelKey: "statusFollowUp" },
  { value: "converted", labelKey: "statusConverted" },
  { value: "lost", labelKey: "statusLost" },
];

export function LeadActions({ lead }: { lead: LeadRow }) {
  const t = useTranslations("admin.leads");
  const router = useRouter();
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const clearFeedback = () => setTimeout(() => setFeedback(null), 5000);

  async function postStatus() {
    setFeedback(null);
    const res = await fetch(`/api/admin/leads/${lead.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setFeedback({ kind: "ok", message: t("leadUpdated") });
      void router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      setFeedback({ kind: "error", message: (json as { error?: string }).error ?? t("leadUpdatedError") });
    }
    clearFeedback();
  }

  async function postConvert() {
    setFeedback(null);
    const res = await fetch(`/api/admin/leads/${lead.id}/convert`, { method: "POST" });
    if (res.ok) {
      setFeedback({ kind: "ok", message: t("convertDone") });
      void router.refresh();
    } else if (res.status === 409) {
      setFeedback({ kind: "error", message: t("convertDuplicate") });
    } else {
      setFeedback({ kind: "error", message: t("leadUpdatedError") });
    }
    clearFeedback();
  }

  async function postNotes() {
    setFeedback(null);
    const res = await fetch(`/api/admin/leads/${lead.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    if (res.ok) {
      setFeedback({ kind: "ok", message: t("leadUpdated") });
    } else {
      setFeedback({ kind: "error", message: t("leadUpdatedError") });
    }
    clearFeedback();
  }

  const isConverted = lead.status === "converted";

  return (
    <div className="flex flex-col gap-2 sm:flex-sm-row sm:items-end">
      <div>
        <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">{t("colStatus")}</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-line bg-surface text-ink rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-text"
        >
          {PIPELINE.map((s) => (
            <option key={s.value} value={s.value}>
              {t(s.labelKey)}
            </option>
          ))}
        </select>
        <Button onClick={postStatus} size="sm" disabled={status === lead.status && !feedback}>
          {t("btnApply")}
        </Button>
      </div>
      {!isConverted && (
        <Button onClick={postConvert} variant="secondary" size="sm">
          {t("convert")}
        </Button>
      )}
      <div>
        <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">{t("notes")}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="border border-line bg-surface text-ink rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-text"
          rows={2}
          placeholder={t("notesPlaceholder")}
        />
        <Button onClick={postNotes} size="sm">{t("notesSave")}</Button>
      </div>
      {feedback && (
        <p className={`text-xs ${feedback.kind === "ok" ? "text-ink-muted" : "text-red-text"}`}>{feedback.message}</p>
      )}
    </div>
  );
}
