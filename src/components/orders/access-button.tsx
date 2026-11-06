"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * M8 (bloc 3b) — Bouton « Accéder à mon espace » (page de suivi, commande
 * confirmée). POST /api/auth/access { statusToken } : si le paiement est
 * confirmé, un e-mail de connexion (lien magique unique, notre Mailer —
 * JAMAIS un lien de téléchargement) part vers l'adresse de la commande.
 *
 * Neutralité : le message affiché après le clic est TOUJOURS le même,
 * quel que soit le résultat (commande non payée, jeton inconnu, erreur
 * réseau) — aucune distinction observable côté client.
 */
export function AccessButton({ statusToken }: { statusToken: string }) {
  const t = useTranslations("order.status");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy || sent) return;
    setBusy(true);
    try {
      await fetch("/api/auth/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusToken }),
      });
    } catch {
      // Jamais d'erreur visible : le message final est identique.
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-4">
        <p className="text-sm text-ink-muted" role="status">
          {t("accessSent")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-block rounded-md border border-ink px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-ink transition-colors duration-base hover:bg-ink hover:text-paper disabled:opacity-60"
      >
        {t("accessAction")}
      </button>
    </div>
  );
}
