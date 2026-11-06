import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { extractPdfText } from "./helpers/pdf-text";

/**
 * M8 (bloc 2c) — GET /api/downloads/[entitlementId] :
 *  - SANS session ⇒ 401 (aucun accès par jeton de statut) ;
 *  - droit invalide (toutes causes du bloc 2b) ⇒ 404 identique ;
 *  - rate limit utilisateur ⇒ 429 ;
 *  - plafond quotidien par droit (configurable) ⇒ 429, AUCUNE lecture ;
 *  - succès : PDF FILIGANÉ, `Cache-Control: private, no-store` (jamais de
 *    cache public), nom de fichier sûr DÉRIVÉ CÔTÉ SERVEUR, aucune URL de
 *    stockage brute, audit download_program SANS PII ;
 *  - source corrompue ou trop lourde ⇒ 503 neutre + alerte sans PII +
 *    état dégradé visible dans /api/health.
 */

const fake = vi.hoisted(() => ({
  userId: "11111111-1111-1111-1111-111111111111" as string | null,
  grantOk: true,
  rateOk: true,
  dailyLimit: 10,
  usedToday: 0,
  sourceBytes: null as Uint8Array | null,
  sourceError: false,
  downloadCalls: [] as string[],
  auditInserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: async () =>
    fake.userId
      ? { userId: fake.userId, isAdmin: false, hasMfa: false, aal2: false }
      : null,
}));

vi.mock("@/lib/files/entitlements", () => ({
  resolveDownloadGrant: async () =>
    fake.grantOk
      ? {
          ok: true,
          grant: {
            entitlementId: "22222222-2222-2222-2222-222222222222",
            orderId: "33333333-3333-3333-3333-333333333333",
            reference: "TKF-2601-M8DL",
            clientName: "Amine Bensalem",
            phone: "+213555123456",
            files: [
              {
                id: "44444444-4444-4444-4444-444444444444",
                storagePath: "starter/programme.pdf",
                label: "Programme A — v2!",
              },
            ],
          },
        }
      : { ok: false },
}));

vi.mock("@/lib/settings", () => ({
  getDownloadsDailyLimit: async () => fake.dailyLimit,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => fake.rateOk,
  userRateLimitKey: () => "download_user:hash",
  ipRateLimitKey: () => "ip:hash",
}));

vi.mock("@/lib/offers/queries", () => ({
  getActiveOffersCount: async () => 3,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          fake.downloadCalls.push(`${bucket}/${path}`);
          if (fake.sourceError || !fake.sourceBytes) {
            return { error: { message: "source illisible" }, data: null };
          }
          return { error: null, data: new Blob([fake.sourceBytes as BlobPart]) };
        },
      }),
    },
    from: (table: string) => {
      if (table !== "audit_logs") throw new Error(`table inattendue: ${table}`);
      return {
        select: () => {
          const chain: Record<string, unknown> = {};
          chain.eq = () => chain;
          chain.gte = () => chain;
          chain.then = (
            onFulfilled: (v: { count: number | null; error: null }) => unknown,
          ) => Promise.resolve({ count: fake.usedToday, error: null }).then(onFulfilled);
          return chain;
        },
        insert: (row: Record<string, unknown>) => {
          fake.auditInserts.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  }),
}));

const route = (await import("@/app/api/downloads/[entitlementId]/route")) as {
  GET: (
    request: Request,
    ctx: { params: Promise<{ entitlementId: string }> },
  ) => Promise<Response>;
};
const health = (await import("@/app/api/health/route")) as {
  GET: () => Promise<Response>;
};

const ENT = "22222222-2222-2222-2222-222222222222";

function get(file?: string): Promise<Response> {
  const url = `http://localhost/api/downloads/${ENT}${file ? `?file=${file}` : ""}`;
  return route.GET(new Request(url), { params: Promise.resolve({ entitlementId: ENT }) });
}

let sourcePdf: Uint8Array;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("Programme fictif — page 1", { x: 50, y: 780, size: 12, font });
  sourcePdf = await doc.save({ useObjectStreams: false });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

beforeEach(() => {
  fake.userId = "11111111-1111-1111-1111-111111111111";
  fake.grantOk = true;
  fake.rateOk = true;
  fake.dailyLimit = 10;
  fake.usedToday = 0;
  fake.sourceBytes = sourcePdf;
  fake.sourceError = false;
  fake.downloadCalls = [];
  fake.auditInserts = [];
});

describe("M8 bloc 2c — route de téléchargement", () => {
  it("accès SANS session ⇒ 401 refus (aucun accès par jeton de statut)", async () => {
    fake.userId = null;
    const res = await get();
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("connexion_requise");
    expect(fake.downloadCalls).toHaveLength(0);
  });

  it("droit invalide (absent, d'autre, non confirmé, révoqué, expiré, deviné) ⇒ 404 identique, AUCUNE lecture de source", async () => {
    fake.grantOk = false;
    const res = await get();
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("not_found");
    expect(fake.downloadCalls).toHaveLength(0);
  });

  it("rate limit par utilisateur atteint ⇒ 429, aucune lecture", async () => {
    fake.rateOk = false;
    const res = await get();
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("rate_limited");
    expect(fake.downloadCalls).toHaveLength(0);
  });

  it("TEST NOMMÉ : plafond quotidien (10/droit, configurable) atteint ⇒ 429 limite_atteinte, AUCUNE lecture de source", async () => {
    fake.usedToday = 10;
    fake.dailyLimit = 10;
    const res = await get();
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("limite_atteinte");
    expect(fake.downloadCalls).toHaveLength(0);
    expect(fake.auditInserts).toHaveLength(0);

    // Configurable : un plafond plus haut débloque (valeur en base).
    fake.dailyLimit = 50;
    const ok = await get();
    expect(ok.status).toBe(200);
  });

  it("TEST NOMMÉ : succès ⇒ PDF filigrané servi avec Cache-Control private no-store, nom sûr dérivé côté serveur, AUCUNE URL de stockage, audit SANS PII", async () => {
    const res = await get();
    expect(res.status).toBe(200);

    const headers = res.headers;
    expect(headers.get("content-type")).toBe("application/pdf");
    // Jamais de cache public ; pas d'ETag/Last-Modified reproductibles.
    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(headers.get("cache-control")).not.toContain("public");
    expect(headers.get("etag")).toBeNull();
    expect(headers.get("last-modified")).toBeNull();

    // Nom sûr : dérivé du libellé (serveur), charset restreint.
    const disposition = headers.get("content-disposition") ?? "";
    expect(disposition).toBe(
      'attachment; filename="programme-a-v2-TKF-2601-M8DL.pdf"',
    );

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    // Le filigrane (référence + téléphone masqué) est dans le PDF servi ;
    // le numéro COMPLET n'y figure pas (décision M8 : masqué). Le contenu
    // est FlateDecode : extraction du texte (helper des tests).
    const text = extractPdfText(body);
    expect(text).toContain("TKF-2601-M8DL");
    expect(text).toContain("+213 *** *** 456");
    expect(text).not.toContain("+213555123456");

    // Aucune URL de stockage brute dans les en-têtes ni le corps.
    const dump = JSON.stringify(Object.fromEntries(headers.entries())) + text;
    expect(dump).not.toContain("storage/v1");
    expect(dump).not.toContain("object/sign");
    expect(dump).not.toContain("supabase");

    // Audit : événement download_program, SANS donnée personnelle.
    expect(fake.auditInserts).toHaveLength(1);
    const audit = fake.auditInserts[0] as {
      action: string;
      actor_id: string;
      actor_role: string;
      entity_id: string;
      metadata: Record<string, unknown>;
    };
    expect(audit.action).toBe("download_program");
    expect(audit.actor_role).toBe("client");
    expect(audit.actor_id).toBe(fake.userId);
    expect(audit.entity_id).toBe(ENT);
    expect(Object.keys(audit.metadata)).toEqual(["offer_file_id"]);
    const auditDump = JSON.stringify(audit);
    expect(auditDump).not.toContain("Amine");
    expect(auditDump).not.toContain("555");
    expect(auditDump).not.toContain("@");
  });

  it("source CORROMPUE ⇒ 503 neutre « indisponible », alerte sans PII, état dégradé remonté dans /api/health", async () => {
    fake.sourceBytes = Buffer.from("%PDF-corrompu-sans-fin");
    const res = await get();
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("indisponible");
    expect(fake.auditInserts).toHaveLength(0); // pas de quota consommé

    // Santé : l'échec remonte (code de cause stable, aucune PII).
    const healthRes = await health.GET();
    const payload = (await healthRes.json()) as {
      status: string;
      services?: Array<{ service: string; reason: string; count: number }>;
    };
    expect(healthRes.status).toBe(503);
    expect(payload.status).toBe("degraded");
    const entry = payload.services?.find((s) => s.service === "pdf_generation");
    expect(entry?.reason).toBe("stamp_failed");
    expect(entry?.count).toBeGreaterThanOrEqual(1);
    const dump = JSON.stringify(payload);
    expect(dump).not.toContain("@");
    expect(dump).not.toContain("555");
  });

  it("source TROP LOURDE (> 20 Mo) ⇒ 503 neutre, jamais de génération", async () => {
    fake.sourceBytes = new Uint8Array(20 * 1024 * 1024 + 1);
    const res = await get();
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("indisponible");
  });

  it("source absente (storage en erreur) ⇒ 503 neutre + dégradé, jamais de stacktrace", async () => {
    fake.sourceError = true;
    const res = await get();
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain("indisponible");
    expect(body).not.toContain("Error:");
    expect(body).not.toContain("storage");
  });
});
