import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import { logEvent } from "@/lib/observability/logger";

const telemetrySchema = z.strictObject({
  event: z.enum(["quiz_start", "quiz_complete", "whatsapp_click"]),
  offer: z.enum(["starter", "online", "in-person"]).optional(),
});

/**
 * Petit endpoint de télémétrie produit (M5, dashboard M10) : uniquement des
 * événements sans donnée personnelle (PRD §14 — pas de santé, pas de PII).
 * Toute réponse est `{ ok: true }` : ni oracle ni erreur exposée aux robots.
 */
export async function POST(request: Request) {
  const allowed = await checkRateLimit(
    ipRateLimitKey(request.headers, "telemetry_ip"),
    60,
    300,
  );
  if (!allowed) return NextResponse.json({ ok: true });

  const body = await request.json().catch(() => null);
  const parsed = telemetrySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });

  logEvent({
    level: "info",
    event: parsed.data.event,
    ...(parsed.data.offer ? { offer: parsed.data.offer } : {}),
  });
  return NextResponse.json({ ok: true });
}
