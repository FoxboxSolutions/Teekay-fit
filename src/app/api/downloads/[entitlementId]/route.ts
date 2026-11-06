import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveDownloadGrant } from "@/lib/files/entitlements";
import { stampPdf } from "@/lib/files/watermark";
import { getDownloadsDailyLimit } from "@/lib/settings";
import { checkRateLimit, userRateLimitKey } from "@/lib/security/rate-limit";
import { recordDegraded } from "@/lib/observability/degraded";

/**
 * M8 (bloc 2c) — GET /api/downloads/[entitlementId]?file=…
 *
 * Livraison des PDF : SESSION CONNECTÉE obligatoire (jamais le jeton de
 * statut), droit vérifié CÔTÉ SERVEUR (bloc 2b — 404 neutre partout),
 * source privée lue en service-role, PDF FILIGANÉ généré à la volée puis
 * renvoyé en flux. Aucune URL de fichier réutilisable n'est créée ni
 * renvoyée (aucun lien signé) — la source n'est jamais servie telle quelle.
 *
 * En-têtes : `Cache-Control: private, no-store` (jamais de cache public),
 * `Content-Disposition` avec nom DÉRIVÉ CÔTÉ SERVEUR (jamais de nom
 * contrôlé par le client), `nosniff`.
 *
 * Limites :
 *  - rate limit PAR UTILISATEUR (40 requêtes/heure, clé HMAC) ;
 *  - plafond de téléchargements PAR DROIT ET PAR JOUR (configurable
 *    `downloads_daily_limit`, défaut 10 — décompté sur audit_logs) ;
 *  - source max 20 Mo, délai total max 15 s (lecture + génération).
 *
 * Échecs de génération (source corrompue, chiffrée, trop lourde, délai
 * dépassé) : réponse NEUTRE « indisponible » + alerte journalisée sans
 * PII + état dégradé remonté dans /api/health.
 */

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const TOTAL_BUDGET_MS = 15_000;
const RATE_LIMIT_PER_HOUR = 40;
const BUCKET = "offer-files";

/** Nom de fichier sûr : dérivé du libellé + référence, jamais du client. */
function safeFilename(label: string, reference: string): string {
  const slug =
    label
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "fichier";
  const ref = reference.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  return `${slug}-${ref}.pdf`;
}

/** Rejet après `ms` (budget total) — l'appel sous-jacent est abandonné. */
function withBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("budget_depasse")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Téléchargements du jour (décompte sur l'audit append-only). */
async function countTodayDownloads(userId: string, entitlementId: string): Promise<number> {
  const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const { count, error } = await createSupabaseAdminClient()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "download_program")
    .eq("actor_id", userId)
    .eq("entity_id", entitlementId)
    .gte("created_at", dayStart);
  if (error) {
    // Fail-safe en cas d'erreur de comptage : on ne bloque pas un client
    // légitime sur une erreur de lecture — le rate limit horaire reste.
    console.error(
      JSON.stringify({ level: "error", event: "download_count_failed" }),
    );
    return 0;
  }
  return count ?? 0;
}

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entitlementId: string }> },
) {
  // 1) SESSION connectée obligatoire (pas de droit par jeton de statut).
  const auth = await getAuthContext();
  if (!auth) return jsonError(401, "connexion_requise");

  // 2) Rate limit par utilisateur (clé HMAC — jamais d'identifiant en clair).
  const limited = await checkRateLimit(
    userRateLimitKey(auth.userId, "download_user"),
    RATE_LIMIT_PER_HOUR,
    3600,
  );
  if (!limited) return jsonError(429, "rate_limited");

  const { entitlementId } = await params;
  const fileId = new URL(request.url).searchParams.get("file");

  // 3) Droit vérifié côté serveur — TOUT échec = 404 identique (aucune
  //    existence révélée : absent, d'autre, non confirmé, révoqué,
  //    expiré, deviné, fichier d'une autre offre).
  const resolved = await resolveDownloadGrant({ userId: auth.userId, entitlementId, fileId });
  if (!resolved.ok) return jsonError(404, "not_found");
  const grant = resolved.grant;
  const file = grant.files[0];
  if (!file) return jsonError(404, "not_found");

  // 4) Plafond quotidien PAR DROIT (configurable en base).
  const dailyLimit = await getDownloadsDailyLimit();
  const used = await countTodayDownloads(auth.userId, grant.entitlementId);
  if (used >= dailyLimit) return jsonError(429, "limite_atteinte");

  const budgetStart = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - budgetStart);

  // 5) Lecture de la source (service-role, budget partagé 15 s).
  let source: Uint8Array;
  try {
    const admin = createSupabaseAdminClient();
    const blob = await withBudget(
      admin.storage.from(BUCKET).download(file.storagePath),
      remaining(),
    );
    if (blob.error || !blob.data) throw new Error("source_illisible");
    source = new Uint8Array(await blob.data.arrayBuffer());
  } catch {
    recordDegraded("pdf_generation", "source_unreadable");
    return jsonError(503, "indisponible");
  }

  // Taille : défense en profondeur (le bucket limite déjà l'upload).
  if (source.byteLength === 0 || source.byteLength > MAX_SOURCE_BYTES) {
    recordDegraded("pdf_generation", "source_size");
    return jsonError(503, "indisponible");
  }

  // 6) Filigrane à la volée (budget restant) — corrompu/chiffré/dépassé ⇒
  //    neutre + alerte sans PII + état dégradé pour /api/health.
  let stamped: Uint8Array;
  try {
    stamped = await withBudget(
      stampPdf(source, {
        reference: grant.reference,
        clientName: grant.clientName,
        phone: grant.phone,
      }),
      Math.max(1, remaining()),
    );
  } catch {
    recordDegraded("pdf_generation", "stamp_failed");
    return jsonError(503, "indisponible");
  }

  // 7) Audit (append-only) : événement download_program SANS PII —
  //    identifiant de droit + fichier seulement (jamais nom, e-mail,
  //    téléphone). Non fatal : le client a son PDF même si l'audit échoue.
  const { error: auditError } = await createSupabaseAdminClient().from("audit_logs").insert({
    actor_id: auth.userId,
    actor_role: "client",
    action: "download_program",
    entity_type: "entitlement",
    entity_id: grant.entitlementId,
    metadata: { offer_file_id: file.id },
  });
  if (auditError) {
    console.error(
      JSON.stringify({ level: "error", event: "download_audit_failed" }),
    );
  }

  // 8) Réponse : flux PDF, jamais de cache public, nom sûr côté serveur.
  return new Response(Buffer.from(stamped) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(file.label, grant.reference)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
