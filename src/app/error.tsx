"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  useEffect(() => {
    // Remontée d'erreur navigateur — le signalement serveur passe par
    // captureError côté route handler (le DSN n'est jamais exposé client).
    console.error(
      JSON.stringify({
        level: "error",
        event: "app.unhandled_error",
        message: error.message,
        digest: error.digest,
      }),
    );
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <button
        type="button"
        onClick={reset}
        className="rounded px-4 py-2 underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t("retry")}
      </button>
    </main>
  );
}
