import { NextResponse } from "next/server";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import {
  isValidOrderStatusTokenFormat,
  lookupOrderStatus,
} from "@/lib/orders/status";
import { generateOrderReceipt } from "@/lib/payments/receipt";

/**
 * Téléchargement du reçu PDF — DEUX entrées, mêmes réponses neutres :
 *
 *  - M7a : `?statusToken=...` — le jeton EST la capacité (seul le hash est
 *    en base, expiration appliquée en requête). Comportement inchangé ;
 *  - M8 : session connectée (page « Mes commandes ») — le droit est la
 *    propriété RLS de la commande + paiement confirmé. Même 404 neutre en
 *    cas d'échec (jamais d'oracle sur l'existence d'une commande).
 *
 * Un `statusToken` PRÉSENT reste traité UNIQUEMENT par le jeton (jamais de
 * repli session : le jeton malformé/inconnu garde son 404 strict).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  // Lecture élargie 60/600 (correction avant M9 — relay légitime/NAT) : la
  // protection fine reste le jeton de statut à capacité secrète.
  const allowed = await checkRateLimit(ipRateLimitKey(request.headers, "order_receipt_ip"), 60, 600);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const { reference } = await params;
  const url = new URL(request.url);
  const statusToken = url.searchParams.get("statusToken");

  if (!/^[A-Za-z0-9][A-Za-z0-9-]{3,60}$/.test(reference)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    let orderId: string | null = null;

    if (statusToken !== null) {
      // ---- Branche jeton (M7a) : comportement strictement inchangé. ----
      if (!isValidOrderStatusTokenFormat(statusToken) || statusToken.length < 16) {
        return new NextResponse(null, { status: 404 });
      }
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
      orderId = (orderRow ?? [])[0]?.id ?? null;
    } else {
      // ---- Branche session (M8) : page « Mes commandes ». ----
      // La RLS (orders_select_own) ne renvoie QUE les commandes du profil
      // connecté — un identifiant deviné ou celui d'autrui ⇒ rien ⇒ 404
      // identique. Paiement confirmé exigé (aucun reçu sur commande non
      // payée).
      const auth = await getAuthContext();
      if (!auth) return new NextResponse(null, { status: 404 });

      const supabase = await createSupabaseServerClient();
      const { data: orderRow } = await supabase
        .from("orders")
        .select("id,status")
        .eq("reference", reference)
        .eq("status", "paid")
        .limit(1);
      orderId = (orderRow ?? [])[0]?.id ?? null;
    }

    if (typeof orderId !== "string") return new NextResponse(null, { status: 404 });

    const receipt = await generateOrderReceipt(orderId);
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
