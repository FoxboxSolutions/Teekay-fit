import { describe, it, expect, vi } from "vitest";

/** 2026-11-09 00:30 heure d'Alger = 2026-11-08T23:30:00Z (UTC+1). Accepte avec ou sans "Z" terminal. */
const Z = (s: string): Date => new Date(s.endsWith("Z") ? s : s + "Z");
const ordre00h30Alger = Z("2026-11-08T23:30:00Z"); // 00h30 Alger le 09/11

const tables: Record<string, unknown[]> = {
  leads: [
    { id: "l1", created_at: "2026-11-08T23:30:00Z", status: "new", next_follow_up_at: null, offer_slug: "starter" }, // 00h30 Alger 09/11
    { id: "l2", created_at: "2026-11-08T09:00:00Z", status: "new", next_follow_up_at: null, offer_slug: "starter" }, // 10:00 Alger 08/11 -> autre jour
    { id: "l3", created_at: "2026-11-15T10:00:00Z", status: "follow_up", next_follow_up_at: "2026-11-09T08:00:00Z", offer_slug: "online" }, // relance le 09/11 Alger
    { id: "l4", created_at: "2026-11-15T10:00:00Z", status: "contacted", next_follow_up_at: "2026-11-20T08:00:00Z", offer_slug: "online" }, // relance hors periode
    { id: "l5", created_at: "2026-11-15T10:00:00Z", status: "converted", next_follow_up_at: null, offer_slug: "starter" }, // converti, pas relance
    { id: "l6", created_at: "2026-11-15T10:00:00Z", status: "lost", next_follow_up_at: null, offer_slug: "in-person" }, // hors pipeline
  ],
  orders: [
    {
      id: "o1",
      reference: "TKF-2611-0001",
      created_at: "2026-11-08T23:30:00Z", // 00h30 Alger 09/11
      total_da: 6000,
      status: "paid",
      payments: [{ status: "confirmed" }],
    },
    {
      id: "o2",
      reference: "TKF-2611-0002",
      created_at: "2026-11-08T09:00:00Z", // 10:00 Alger 08/11
      total_da: 2000,
      status: "pending_payment",
      payments: [{ status: "pending" }],
    },
    {
      id: "o3",
      reference: "TKF-2611-0003",
      created_at: "2026-11-10T10:00:00Z", // 11:00 Alger 10/11
      total_da: 10000,
      status: "refunded",
      payments: [{ status: "confirmed" }],
    },
    {
      id: "o4",
      reference: "TKF-2611-0004",
      created_at: "2026-11-20T10:00:00Z",
      total_da: 6000,
      status: "paid",
      payments: [{ status: "confirmed" }],
    },
  ],
  payments: [
    { id: "p1", status: "verifying" },
    { id: "p2", status: "verifying" },
    { id: "p3", status: "confirmed" },
  ],
  quiz_submissions: [
    { id: "q1", started_at: "2026-11-09T07:00:00Z", completed_at: "2026-11-09T07:10:00Z" }, // 08:00 Alger 09/11
    { id: "q2", started_at: "2026-11-09T08:00:00Z", completed_at: null }, // 09:00 Alger 09/11
    { id: "q3", started_at: "2026-11-20T10:00:00Z", completed_at: "2026-11-20T10:05:00Z" }, // autre jour
  ],
};

function makeFakeSupabase() {
  const snap = JSON.parse(JSON.stringify(tables));
  return {
    from: (table: string) => {
      const rows = (snap[table] ?? []) as Record<string, unknown>[];
      let countMode = false;
      const mods: Array<{ col: string; op: string; val: unknown }> = [];
      const apply = () => {
        let out = rows;
        for (const m of mods) {
          out = out.filter((row) => {
            const cell = row[m.col];
            switch (m.op) {
              case "gte":
                return new Date(cell as string) >= new Date(m.val as string);
              case "lt":
                return new Date(cell as string) < new Date(m.val as string);
              case "eq":
                return cell === m.val;
              case "in":
                return (m.val as unknown[]).includes(cell);
              default:
                return true;
            }
          });
        }
        return countMode ? { data: null, count: out.length, error: null } : { data: out, error: null };
      };
      const chain: Record<string, unknown> = {
        select: (_a?: unknown, _b?: unknown) => {
          countMode = !!_b && (countMode || (_b as { count?: string }).count === "exact");
          return chain;
        },
        gte: (col: string, val: unknown) => { mods.push({ col, op: "gte", val }); return chain; },
        lt: (col: string, val: unknown) => { mods.push({ col, op: "lt", val }); return chain; },
        eq: (col: string, val: unknown) => { mods.push({ col, op: "eq", val }); return chain; },
        in: (col: string, val: unknown[]) => { mods.push({ col, op: "in", val }); return chain; },
        then: (onFulfilled: (v: { data: unknown; count?: number; error: unknown }) => unknown) =>
          Promise.resolve(apply()).then(onFulfilled),
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => makeFakeSupabase(),
}));

function unwrap<T>(ind: Indicator<T>): T {
  if (!ind.available) throw new Error(`indicateur indisponible (${ind.reason})`);
  return ind.value;
}

import { newLeads, leadsToFollowUp, ordersCount, confirmedRevenue, paymentsVerifyingCount, quizCompletion, conversionByOffer, type Indicator } from "@/lib/admin/indicators";

describe("indicateurs M9a sur jeux connus (Africa/Algiers)", () => {

  it("nouveaux leads : commande/lead a 00h30 Alger compte dans le jour 09/11, pas le 08/11 (UTC naive exclu)", async () => {
    const algerDay09 = await newLeads({ kind: "day", at: ordre00h30Alger });
    expect(algerDay09).toEqual({ available: true, value: 1 }); // seul l1
    const utcDay08 = await newLeads({ kind: "day", at: Z("2026-11-08T12:00:00") }); // jour UTC 08/11
    expect(utcDay08).toEqual({ available: true, value: 1 }); // seulement l2 (10:00 Alger 08/11)
    // l1 (00h30 Alger 09/11 = 23:30Z 08/11) ne doit pas tomber dans un filtre UTC du 08/11 :
    expect(unwrap(algerDay09)).toBe(1);
    expect(unwrap(utcDay08)).toBe(1);
  });

  it("commandes du jour : la commande a 00h30 Alger le 09/11 est dans le jour algerois 09/11", async () => {
    const day = await ordersCount({ kind: "day", at: ordre00h30Alger });
    expect(day).toEqual({ available: true, value: 1 }); // o1 seulement (00h30 Alger 09/11)
    const mois = await ordersCount({ kind: "month", at: ordre00h30Alger });
    expect(mois).toEqual({ available: true, value: 4 }); // toutes les commandes de novembre Alger
  });

  it("revenu confirme : confirme + non rembourse uniquement, copie figuree", async () => {
    const rev = await confirmedRevenue({ kind: "month", at: Z("2026-11-01T00:00:00Z") });
    expect(rev).toEqual({ available: true, value: 12000 }); // o1 + o4 (o3 remboursee exclue)
  });

  it("paiements a verifier : comptage statuts verifying", async () => {
    const v = await paymentsVerifyingCount();
    expect(v).toEqual({ available: true, value: 2 });
  });

  it("leads a relancer : numerateur = relances dans la periode, denominateur = pipeline actif", async () => {
    const r = await leadsToFollowUp({ kind: "day", at: ordre00h30Alger });
    expect(r).toEqual({ available: true, value: { count: 1, totalActive: 4 } }); // l3 relance le 09/11 ; actif: l1,l2,l3,l4,l5 (l6 lost exclue) -> 5 ?
  });

  it("taux de completion du quiz : terminees / demarrees sur la periode", async () => {
    const c = await quizCompletion({ kind: "day", at: Z("2026-11-09T12:00:00Z") }); // jour Alger 09/11
    expect(c).toEqual({ available: true, value: { started: 2, completed: 1, rate: 0.5 } });
    const vide = await quizCompletion({ kind: "day", at: Z("2026-11-21T12:00:00Z") });
    expect(vide).toEqual({ available: true, value: { started: 0, completed: 0, rate: 0 } });
  });

  it("conversion par offre : taux par offre, offre sans lead absente", async () => {
    const conv = await conversionByOffer({ kind: "month", at: Z("2026-11-01T00:00:00Z") });
    expect(conv.available).toBe(true);
    const starter = unwrap(conv).find((o: { offerSlug: string; leads: number; converted: number; rate: number }) => o.offerSlug === "starter");
    expect(starter).toMatchObject({ leads: 3, converted: 1, rate: 1 / 3 }); // l1, l2, l5 ; l5 converti
    const online = unwrap(conv).find((o: { offerSlug: string; leads: number; converted: number; rate: number }) => o.offerSlug === "online");
    expect(online).toMatchObject({ leads: 2, converted: 0, rate: 0 }); // l3, l4
    expect(unwrap(conv).find((o: { offerSlug: string }) => o.offerSlug === "in-person")?.leads).toBe(1);
    expect(unwrap(conv).some((o: { offerSlug: string }) => o.offerSlug === "inexistante")).toBe(false);
  });
});
