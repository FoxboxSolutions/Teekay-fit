import { NextResponse } from "next/server";
import { getActiveOffersCount } from "@/lib/offers/queries";

export async function GET() {
  const activeOffers = await getActiveOffersCount();

  // Dégradé si zéro offre active, ou si le décompte est inexploitable (erreur).
  const degraded = activeOffers === null || activeOffers === 0;
  const status = degraded ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      activeOffers,
      ...(activeOffers === null ? { activeOffersError: "indisponible" } : {}),
    },
    { status: degraded ? 503 : 200 },
  );
}
