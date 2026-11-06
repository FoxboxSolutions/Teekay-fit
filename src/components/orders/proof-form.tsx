"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

const ERRORS_FALLBACK = "indisponible";

/**
 * Soumission de la preuve de paiement BaridiMob (M7a) depuis la page de
 * statut : référence de transaction (obligatoire, format validé côté
 * serveur) + capture optionnelle (jpeg/png/webp, 5 Mo max — type vérifié
 * par magie du fichier, EXIF retiré, stockage privé côté serveur).
 * Le statut passe en `verifying` via la route POST
 * /api/orders/[reference]/proof (transition_payment) — ce composant
 * n'affiche que les champs et la réponse neutre.
 */
export function ProofForm({ reference, token }: { reference: string; token: string }) {
  const t = useTranslations("order.status.proof");
  const [txn, setTxn] = useState("");
  const [capture, setCapture] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitted) return;
    setBusy(true);
    setErrorKey(null);
    try {
      const form = new FormData();
      form.set("statusToken", token);
      form.set("txn", txn);
      if (capture) form.set("capture", capture);
      const res = await fetch(`/api/orders/${reference}/proof`, { method: "POST", body: form });
      if (res.ok) {
        setSubmitted(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setErrorKey(body?.error ?? ERRORS_FALLBACK);
    } catch {
      setErrorKey(ERRORS_FALLBACK);
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">{t("submitted")}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t("submittedText")}</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold">{t("title")}</h2>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <Field htmlFor="proof-txn" label={t("txnLabel")}>
          <Input
            id="proof-txn"
            name="txn"
            value={txn}
            onChange={(e) => setTxn(e.target.value)}
            required
            minLength={6}
            maxLength={60}
            autoComplete="off"
          />
        </Field>
        <Field htmlFor="proof-capture" label={t("captureLabel")}>
          <Input
            id="proof-capture"
            name="capture"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setCapture(e.target.files?.[0] ?? null)}
          />
        </Field>
        <p className="text-xs text-ink-muted">{t("captureHint")}</p>
        {errorKey !== null && (
          <p role="alert" className="text-sm font-semibold text-red-text">
            {t(errorKey)}
          </p>
        )}
        <Button type="submit" disabled={busy} className="self-start">
          {busy ? t("submitting") : t("submit")}
        </Button>
      </form>
    </Card>
  );
}
