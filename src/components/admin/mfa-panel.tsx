"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Phase = "idle" | "enrolled" | "verified";

/**
 * Panneau MFA minimal (M7a) : enrôlement TOTP + défi + codes de secours.
 * Les routes serveur (/api/admin/mfa/*) rejouent le garde admin côté serveur
 * ; ce composant n'affiche que les étapes — aucun secret n'est conservé
 * côté client (QR et clé seulement pendant l'écran d'activation).
 */
export function AdminMfaPanel({ alreadyVerified }: { alreadyVerified: boolean }) {
  const t = useTranslations("admin.mfa");
  const [phase, setPhase] = useState<Phase>(alreadyVerified ? "verified" : "idle");
  const [enroll, setEnroll] = useState<{
    factorId: string;
    qrCode: string | null;
    secret: string | null;
  } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startEnroll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mfa/enroll", { method: "POST" });
      if (res.status === 429) {
        setError(t("rateLimited"));
        return;
      }
      if (!res.ok) {
        setError(t("enrollFailed"));
        return;
      }
      const data = (await res.json()) as {
        factorId: string;
        qrCode: string | null;
        secret: string | null;
        recoveryCodes: string[];
      };
      setEnroll({ factorId: data.factorId, qrCode: data.qrCode, secret: data.secret });
      setRecoveryCodes(data.recoveryCodes ?? []);
      setPhase("enrolled");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!enroll) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: enroll.factorId, code }),
      });
      if (res.status === 429) {
        setError(t("rateLimited"));
        return;
      }
      if (!res.ok) {
        setError(t("invalidCode"));
        return;
      }
      setPhase("verified");
    } finally {
      setBusy(false);
    }
  }

  function downloadRecoveryCodes() {
    if (!recoveryCodes) return;
    const blob = new Blob([`${t("recoveryTitle")}\n\n${recoveryCodes.join("\n")}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teekay-fit-codes-de-secours.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="p-6">
      {phase === "idle" && (
        <div>
          <h2 className="font-display text-lg font-bold">{t("enrollTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("enrollIntro")}</p>
          <Button className="mt-4" onClick={startEnroll} disabled={busy}>
            {t("startEnroll")}
          </Button>
          {error && <p className="mt-3 text-sm text-red-text">{error}</p>}
        </div>
      )}

      {phase === "enrolled" && enroll && (
        <div>
          <h2 className="font-display text-lg font-bold">{t("stepVerify")}</h2>
          {enroll.qrCode && (
            /* QR data-URI éphémère (secret d'enrôlement) : jamais mis en cache
               ni optimisé par next/image — rendu direct volontaire. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={enroll.qrCode}
              alt=""
              aria-label={t("qrAlt")}
              className="mx-auto mt-4 max-w-56"
            />
          )}
          {enroll.secret && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide">
                {t("secretLabel")}
              </p>
              <p className="mt-1 break-all font-mono text-sm">{enroll.secret}</p>
            </div>
          )}
          <div className="mt-4 max-w-48">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
            />
          </div>
          <Button className="mt-4" onClick={verify} disabled={busy || code.length !== 6}>
            {busy ? t("verifying") : t("verify")}
          </Button>
          {error && <p className="mt-3 text-sm text-red-text">{error}</p>}
        </div>
      )}

      {phase === "verified" && (
        <div>
          <h2 className="font-display text-lg font-bold">{t("activeTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("activeIntro")}</p>
          {recoveryCodes && recoveryCodes.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="font-display text-sm font-bold">{t("recoveryTitle")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t("recoveryIntro")}</p>
              <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
                {recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <Button className="mt-4" variant="secondary" onClick={downloadRecoveryCodes}>
                {t("downloadCodes")}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
