"use client";

/** Événements produit acceptés par /api/telemetry (jamais de PII, PRD §14). */
export type TelemetryEvent = "quiz_start" | "quiz_complete" | "whatsapp_click";

const ENDPOINT = "/api/telemetry";

/**
 * Envoi « fire-and-forget » d'un événement produit. Ni attente ni erreur
 * visibles : la télémétrie ne doit jamais dégrader l'expérience.
 */
export function trackEvent(event: TelemetryEvent, offer?: string): void {
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(offer ? { event, offer } : { event }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Silencieux par conception.
  }
}
