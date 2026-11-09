"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function OutboxResendButton({ id }: { id: string }) {
  const t = useTranslations("admin.aTraiter");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  async function resend() {
    setFeedback(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/outbox/${id}/resend`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedback({
          kind: "ok",
          message: json.status === "queued" ? t("resendSent") : t("resendAlready"),
        });
      } else {
        setFeedback({ kind: "error", message: json.error ?? t("resendFailed") });
      }
    } catch {
      setFeedback({ kind: "error", message: t("resendFailed") });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={resend} disabled={pending} size="sm">
        {pending ? t("resending") : t("resendButton")}
      </Button>
      {feedback && (
        <span className={`text-xs ${feedback.kind === "ok" ? "text-ink-muted" : "text-red-text"}`}>
          {feedback.message}
        </span>
      )}
    </div>
  );
}
