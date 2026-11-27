"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ErrorKind = "invalid" | "rate" | "network";

/**
 * Formulaire de connexion par lien magique.
 *
 * La réponse finale est TOUJOURS neutre (compte existant ou non) : le
 * serveur renvoie `{ ok: true }` dans les deux cas. Seules les erreurs de
 * forme (e-mail invalide), de débit (429) ou réseau sont distinguées — elles
 * ne révèlent rien sur l'existence d'un compte.
 */
export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("auth.login");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      if (res.status === 429) {
        setError("rate");
        return;
      }
      if (!res.ok) {
        setError("invalid");
        return;
      }
      setSent(true);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="mt-8 rounded-card border border-line bg-surface p-6 text-sm text-ink-muted" role="status">
        {t("sent")}
      </p>
    );
  }

  return (
    <form className="mt-8" onSubmit={onSubmit} noValidate={false}>
      <label className="block text-sm font-semibold" htmlFor="login-email">
        {t("emailLabel")}
      </label>
      <Input
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mt-2"
      />
      <Button type="submit" className="mt-4" disabled={busy || email.length === 0}>
        {busy ? t("sending") : t("submit")}
      </Button>
      {error && (
        <p className="mt-3 text-sm text-red-text" role="alert">
          {error === "rate" ? t("rateLimited") : error === "network" ? t("networkError") : t("invalidEmail")}
        </p>
      )}
    </form>
  );
}
