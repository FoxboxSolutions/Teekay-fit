import { NextResponse } from "next/server";
import { getActiveOffersCount } from "@/lib/offers/queries";
import { appEnvStatus } from "@/lib/env";
import { getDegraded } from "@/lib/observability/degraded";

export async function GET() {
  const activeOffers = await getActiveOffersCount();

  // Services dégradés du processus (M8) : échecs d'e-mail ou de
  // génération de PDF — codes de cause SANS PII (voir observability).
  const services = getDegraded();

  // Dégradé si zéro offre active, si le décompte est inexploitable, ou si
  // un service (e-mail, PDF) a échoué depuis le démarrage.
  const degraded = activeOffers === null || activeOffers === 0 || services.length > 0;
  const status = degraded ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      activeOffers,
      // APP_ENV visible (décision : un oubli est lisible et sans danger) —
      // "development" | "preview" | "production" | "absent" | "invalid".
      appEnv: appEnvStatus(),
      ...(activeOffers === null ? { activeOffersError: "indisponible" } : {}),
      ...(services.length > 0 ? { services } : {}),
    },
    { status: degraded ? 503 : 200 },
  );
}
