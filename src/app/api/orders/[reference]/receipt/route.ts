import { NextResponse } from "next/server";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isValidOrderStatusTokenFormat,
  lookupOrderStatus,
} from "@/lib/orders/status";
import { generateOrderReceipt } from "@/lib/payments/receipt";

/**
 * M7a bloc 6 — téléchargement du reçu PDF par le client :
 * GET /api/orders/[reference]/receipt?statusToken=...
 * Le jeton de statut EST la capacité de téléchargement (seul le hash est
 * en base, expiration appliquée en requête). Le reçu n'existe que si le
 * paiement est confirmé (order.status = 'paid') ; sinon réponse neutre
 * 404 — aucune différence observable entre commande inconnue, jeton
 * expiré ou paiement non confirmé. Limitation de débit par IP hachée.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const allowed = await checkRateLimit(ipRateLimitKey(request.headers, "order_receipt_ip"), 20, 600);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { reference } = await params;
  const url = new URL(request.url);
  const statusToken = url.searchParams.get("statusToken") ?? "";

  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]{3,60}$/.test(reference) ||
    !isValidOrderStatusTokenFormat(statusToken) ||
    statusToken.length < 16
  ) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const lookup = await lookupOrderStatus(statusToken);
    if (lookup.status === "missing" || lookup.order.reference !== reference) {
      return new NextResponse(null, { status: 404 });
    }
    if (lookup.order.order_status !== "paid") {
      return new NextResponse(null, { status: 404 });
    }

    // L'id de la commande est relu par référence (le jeton ne porte jamais d'id).
    const { data: orderRow } = await createSupabaseAdminClient()
      .from("orders")
      .select("id")
      .eq("reference", reference)
      .eq("status", "paid")
      .limit(1);
    const id = (orderRow ?? [])[0]?.id;
    if (typeof id !== "string") return new NextResponse(null, { status: 404 });

    const receipt = await generateOrderReceipt(id);
    if (!receipt.found) return new NextResponse(null, { status: 404 });

    return new NextResponse(new Uint8Array(receipt.pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(receipt.pdf.byteLength),
        // Téléchargement inline : un nom stable, sans valeur falsifiée.
        "Content-Disposition": `attachment; filename="recu-${receipt.copy.reference}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "order_receipt_failed",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    return new NextResponse(null, { status: 404 });
  }
}
