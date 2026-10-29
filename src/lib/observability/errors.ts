import "server-only";

type ErrorScope = "app" | "api";

/**
 * Suivi des erreurs : branché seulement si ERROR_TRACKING_DSN est renseigné
 * (vide par défaut, PRD annexe). Fallback : journal structuré local.
 */
export async function captureError(
  scope: ErrorScope,
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const dsn = process.env.ERROR_TRACKING_DSN;
  const payload = {
    scope,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
  };

  if (!dsn) {
    const { logEvent } = await import("./logger");
    logEvent({ level: "error", event: `error.${scope}`, ...payload });
    return;
  }

  try {
    await fetch(dsn, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Dernier recours : journal local si le fournisseur est injoignable.
    const { logEvent } = await import("./logger");
    logEvent({ level: "error", event: "error_tracking_unreachable", ...payload });
  }
}
