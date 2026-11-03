"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * M7a — liste des paiements à vérifier, vue admin (client).
 * Les garde-fous sont côté serveur (routes /api/admin/payments/*, aal2) ;
 * ce composant appelle, affiche (montant attendu à côté de la preuve,
 * drapeaux anti-fraude) et envoie (montant reçu / motif). Tout message
 * d'erreur reste générique.
 */

type Proof = {
  id: string;
  txnReference: string;
  captureUrl: string | null;
  createdAt: string;
  duplicate: boolean;
};

type PaymentItem = {
  paymentId: string;
  orderId: string;
  reference: string;
  expectedAmountDa: number;
  orderStatus: string;
  needsAdminReview: boolean;
  paymentCreatedAt: string;
  proofs: Proof[];
};

const SEP_TXN = " : "; // libellé → valeur
const SEP_DASH = " — ";
const SEP_CURRENCY = " DA";

export function AdminPaymentsList() {
  const t = useTranslations("admin.payments");
  const [items, setItems] = useState<PaymentItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/payments");
      if (res.status === 403) {
        setLoadError("mfaRequiredAction");
        setItems([]);
        return;
      }
      if (!res.ok) {
        setLoadError("error");
        setItems(null);
        return;
      }
      const data = (await res.json()) as { payments: PaymentItem[] };
      setItems(data.payments);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial au montage (spinner synchrone)
    void load();
  }, [load]);

  async function confirm(payment: PaymentItem) {
    const raw = amounts[payment.paymentId] ?? "";
    const amountDa = Number.parseInt(raw, 10);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/payments/${payment.paymentId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountDa }),
      });
      if (res.status === 403) {
        setFeedback({ [payment.paymentId]: "mfaRequiredAction" });
        return;
      }
      if (res.status === 400) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setFeedback({
          [payment.paymentId]:
            body?.error === "montant_invalide" ? "amountInvalid" : "error",
        });
        return;
      }
      if (!res.ok) {
        setFeedback({ [payment.paymentId]: "error" });
        return;
      }
      setFeedback({ [payment.paymentId]: "confirmed" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function reject(payment: PaymentItem) {
    const reason = (reasons[payment.paymentId] ?? "").trim();
    if (reason.length < 3) {
      setFeedback({ [payment.paymentId]: "reasonMissing" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/payments/${payment.paymentId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.status === 403) {
        setFeedback({ [payment.paymentId]: "mfaRequiredAction" });
        return;
      }
      if (!res.ok) {
        setFeedback({ [payment.paymentId]: "error" });
        return;
      }
      setFeedback({ [payment.paymentId]: "rejected" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (items === null && !loadError) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (items === null) {
    return (
      <div>
        <p className="text-sm text-red-text">{t("error")}</p>
        <Button className="mt-3" variant="secondary" onClick={() => void load()}>
          {t("reload")}
        </Button>
      </div>
    );
  }
  if (loadError) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">{t(loadError as never)}</p>
        <Link className="text-sm underline" href="/fr/admin/mfa">
          {t("goMfa")}
        </Link>
      </Card>
    );
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const nf = new Intl.NumberFormat("fr-FR");

  return (
    <ul className="space-y-4">
      {items.map((p) => (
        <li key={p.paymentId}>
          <Card className="p-6">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("reference")}
              </span>
              <span className="font-display font-bold">{p.reference}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("expectedAmount")}
              </span>
              <span className="font-semibold">
                {nf.format(p.expectedAmountDa)}
                {SEP_CURRENCY}
              </span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("orderStatus")}
              </span>
              <span>{p.orderStatus}</span>
            </div>

            {p.needsAdminReview && (
              <p className="mt-2 text-sm text-red-text">{t("reviewFlag")}</p>
            )}

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide">
                {t("proofs")}
              </p>
              {p.proofs.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{t("noCapture")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {p.proofs.map((proof) => (
                    <li key={proof.id} className="text-sm">
                      <span className="text-muted-foreground">
                        {t("txnRef")}
                        {SEP_TXN}
                      </span>
                      <span className="font-mono">{proof.txnReference}</span>
                      {proof.captureUrl && (
                        <>
                          <span className="sr-only">{SEP_DASH}</span>
                          <a
                            className="underline"
                            href={proof.captureUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("capture")}
                          </a>
                        </>
                      )}
                      {proof.duplicate && (
                        <p className="text-red-text">{t("duplicateFlag")}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide">
                  {t("confirmTitle")}
                </p>
                <div className="mt-2 max-w-40">
                  <Input
                    inputMode="numeric"
                    placeholder={String(p.expectedAmountDa)}
                    value={amounts[p.paymentId] ?? ""}
                    onChange={(e) =>
                      setAmounts({ ...amounts, [p.paymentId]: e.target.value })
                    }
                  />
                </div>
                <Button
                  className="mt-2"
                  onClick={() => void confirm(p)}
                  disabled={busy}
                >
                  {t("confirmAction")}
                </Button>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide">
                  {t("rejectTitle")}
                </p>
                <div className="mt-2">
                  <Input
                    value={reasons[p.paymentId] ?? ""}
                    onChange={(e) =>
                      setReasons({ ...reasons, [p.paymentId]: e.target.value })
                    }
                    maxLength={500}
                  />
                </div>
                <Button
                  className="mt-2"
                  variant="secondary"
                  onClick={() => void reject(p)}
                  disabled={busy}
                >
                  {t("rejectAction")}
                </Button>
              </div>
            </div>

            {feedback[p.paymentId] && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t(feedback[p.paymentId] as never)}
              </p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
