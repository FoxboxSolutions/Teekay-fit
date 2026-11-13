import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

/**
 * M9a point (f) — page /admin/clients : les réponses PAR-Q ne sont JAMAIS
 * lues ni affichées au chargement. Une exigence = un test nommé :
 *
 *  1. la requête vers `aptitude_questionnaires` est limitée à
 *     order_id, medical_advice_recommended, created_at — AUCUNE colonne de
 *     réponse (q1..q7), jamais select * ;
 *  2. le rendu (arbre RSC sérialisé = HTML + props) ne contient aucune
 *     réponse — seulement le drapeau « avis médical » et le bouton de
 *     consultation explicite, branché sur le bon identifiant de commande.
 */
const fake = vi.hoisted(() => ({
  guard: null as Record<string, unknown> | null,
  selects: [] as { table: string; cols: string }[],
  eqs: [] as { table: string; col: string; val: unknown }[],
}));

const guardOk = {
  ok: true,
  auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
};

const customers = [
  {
    id: "c-1",
    name: "Jean Dupont",
    phone: "+213 6 00 00 00 01",
    phone_norm: "+213600000001",
    email: "jean@example.com",
    created_at: "2026-10-01T10:00:00Z",
  },
];

const orders = [
  {
    id: "o-1",
    customer_id: "c-1",
    reference: "TKF-2611-0001",
    status: "paid",
    total_da: 6000,
    created_at: "2026-10-10T10:00:00Z",
  },
  {
    id: "o-2",
    customer_id: "c-1",
    reference: "TKF-2611-0002",
    status: "pending_payment",
    total_da: 2000,
    created_at: "2026-10-15T10:00:00Z",
  },
];

const aptitudes = [
  {
    order_id: "o-1",
    medical_advice_recommended: true,
    created_at: "2026-10-10T10:00:00Z",
  },
];

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () => fake.guard,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => {
    const dataFor: Record<string, unknown[]> = {
      customers,
      orders,
      aptitude_questionnaires: aptitudes,
    };
    return {
      from: (table: string) => {
        let rows = dataFor[table] ?? [];
        let singleMode = false;
        const mods: Array<{ col: string; op: string; val: unknown }> = [];
        const apply = () => {
          for (const m of mods) {
            if (m.op === "eq") rows = rows.filter((r) => (r as Record<string, unknown>)[m.col] === m.val);
            if (m.op === "in") rows = rows.filter((r) => (m.val as unknown[]).includes((r as Record<string, unknown>)[m.col]));
          }
          return singleMode ? (rows[0] ?? null) : rows;
        };
        const chain: Record<string, unknown> = {
          select: (cols: string) => {
            fake.selects.push({ table, cols });
            return chain;
          },
          eq: (col: string, val: unknown) => {
            mods.push({ col, op: "eq", val });
            fake.eqs.push({ table, col, val });
            return chain;
          },
          in: (col: string, val: unknown[]) => {
            mods.push({ col, op: "in", val });
            fake.eqs.push({ table, col, val });
            return chain;
          },
          order: () => chain,
          single: () => {
            singleMode = true;
            return chain;
          },
          then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
            Promise.resolve({ data: apply(), error: null }).then(onFulfilled),
        };
        return chain;
      },
    };
  },
}));

vi.mock("@/components/admin/parq-answers-button", () => ({
  ParqAnswersButton: function parqAnswersButtonMock() {
    return null;
  },
}));

type PageModule = typeof import("@/app/[locale]/admin/clients/page");
let page: PageModule["default"];

type Element = { type?: unknown; props?: { children?: unknown; [k: string]: unknown } };

/** Parcours de l'arbre RSC (composants clients JAMAIS exécutés : lus comme types). */
function findElements(node: unknown, type: unknown, out: Element[] = []): Element[] {
  if (node === null || typeof node !== "object") return out;
  const el = node as Element;
  if (el.type === type) out.push(el);
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) findElements(child, type, out);
  } else {
    findElements(children, type, out);
  }
  return out;
}

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

beforeAll(async () => {
  ({ default: page } = await import("@/app/[locale]/admin/clients/page"));
});

beforeEach(() => {
  fake.guard = guardOk;
  fake.selects = [];
  fake.eqs = [];
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("M9a (f) — page /admin/clients : aucune réponse PAR-Q au chargement", () => {
  it("TEST NOMMÉ : la requête est limitée — aptitude_questionnaires lu avec order_id, medical_advice_recommended, created_at (aucune colonne q1..q7, jamais select *)", async () => {
    await page({ params, searchParams: Promise.resolve({ customer: "c-1" }) });
    const aptitudeSelects = fake.selects.filter((s) => s.table === "aptitude_questionnaires");
    expect(aptitudeSelects.length, "une seule requête aptitude_questionnaires").toBe(1);
    expect(aptitudeSelects[0]?.cols).toBe("order_id, medical_advice_recommended, created_at");
    const anyWildcard = fake.selects.some((s) => s.table === "aptitude_questionnaires" && s.cols.includes("*"));
    expect(anyWildcard).toBe(false);
  });

  it("TEST NOMMÉ : le rendu (HTML + props) ne contient AUCUNE réponse — seulement le drapeau « avis médical » et le bouton de consultation explicite branché sur la commande", async () => {
    const el = await page({ params, searchParams: Promise.resolve({ customer: "c-1" }) });
    const { ParqAnswersButton } = (await import("@/components/admin/parq-answers-button")) as unknown as {
      ParqAnswersButton: (props: { orderId: string }) => null;
    };
    const json = JSON.stringify(el);

    // Le drapeau NON sensible est affiché (rempli + avis médical conseillé).
    expect(json).toContain("t:parQRempli");
    expect(json).toContain("t:avisMedicalOui");
    // Aucune colonne de réponse nulle part (props sérialisées incluses).
    for (const col of [
      "q1_heart_condition",
      "q2_exertion_chest_pain",
      "q3_rest_chest_pain",
      "q4_syncope",
      "q5_joint_bone_problem",
      "q6_heart_medication",
      "q7_other_restriction",
      "objective",
      "experience_level",
    ]) {
      expect(json.includes(col), `aucune colonne ${col} dans le rendu`).toBe(false);
    }
    // Le panneau de réponses n'est pas rendu avant le clic (titre absent).
    expect(json.includes("Réponses du questionnaire")).toBe(false);
    // Un bouton de consultation explicite PAR commande remplie, branché
    // sur le bon identifiant (o-1 rempli, o-2 sans questionnaire).
    const buttons = findElements(el, ParqAnswersButton);
    expect(buttons.length).toBe(1);
    expect((buttons[0]?.props as { orderId?: string }).orderId).toBe("o-1");
  });
});
