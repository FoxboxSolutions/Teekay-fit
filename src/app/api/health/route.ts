import { NextResponse } from "next/server";
import { getActiveOffersCount } from "@/lib/offers/queries";
import { appEnvStatus } from "@/lib/env";

export async function GET() {
  const activeOffers = await getActiveOffersCount();

  // Dégradé si zéro offre active, ou si le décompte est inexploitable (erreur).
  const degraded = activeOffers === null || activeOffers === 0;
  const status = degraded ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      activeOffers,
      // APP_ENV visible (décision : un oubli est lisible et sans danger) —
      // "development" | "preview" | "production" | "absent" | "invalid".
      appEnv: appEnvStatus(),
      ...(activeOffers === null ? { activeOffersError: "indisponible" } : {}),
    },
    { status: degraded ? 503 : 200 },
  );
}
