import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/**
 * M7a bloc 5 — notifications client (idempotence) :
 *  - PREMIER envoi : réservation outbox → jeton de suivi RÉGÉNÉRÉ
 *    (renew_order_status_token) → e-mail nouveaux contenus reçu/lien →
 *    outbox marquée sent ;
 *  - OUTBOX OCCUPÉE (0 ligne rendue par l'upsert ignoreDuplicates = rejeu)
 *    ⇒ skipped_replay : AUCUN renew, AUCUN envoi (envoi idempotent) ;
 *  - commande sans e-mail ⇒ no_email, rien d'autre ;
 *  - mailer refuse ⇒ outbox failed, résultat failed, jamais d'exception ;
 *  - REJET : message neutre (aucune référence de transaction, aucun motif
 *    technique), pas de jeton regénéré.
 */
const fake = vi.hoisted(() => ({
  ordersQueue: [] as Array<Record<string, unknown> | { __single: true; data: Record<string, unknown> | null }>,
  outboxQueue: [] as Array<{ data: unknown; error: unknown }>,
  outboxSelectSettle: null as { data: unknown; error: unknown } | null,
  outboxUpdates: [] as Record<string, unknown>[],
  outboxInserts: [] as Record<string, unknown>[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  mailerOutbox: [] as unknown[],
  mailerSend: true,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      fake.rpcCalls.push({ name, args });
      return { data: null, error: null };
    },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const settle = (): { data: unknown; error: unknown } => {
        const queue = table === "orders" ? fake.ordersQueue : table === "email_outbox" ? fake.outboxQueue : [];
        const next = queue.shift() ?? { data: null, error: null };
        return { data: next.data ?? null, error: null };
      };
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = () => {
        // Lecture commande : file dédiée (data direct).
        const next = fake.ordersQueue.shift();
        const row = next as { data?: unknown } | undefined;
        return Promise.resolve({ data: row && "data" in row ? row.data : row ?? null, error: null });
      };
      chain.insert = (payload: Record<string, unknown>) => {
        fake.outboxInserts.push(payload);
        return {
          select: () => ({
            then: (
              onFulfilled: (v: { data: unknown; error: unknown } | null) => unknown,
            ) =>
              Promise.resolve(fake.outboxSelectSettle ?? { data: [], error: null }).then(
                onFulfilled,
              ),
          }),
        };
      };
      chain.update = (patch: Record<string, unknown>) => {
        fake.outboxUpdates.push(patch);
        return Object.assign(chain, { update: undefined });
      };
      chain.then = (
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
      ) => Promise.resolve(settle()).then(onFulfilled);
      return chain;
    },
  }),
}));

vi.mock("@/lib/mailer/provider", () => ({
  getMailer: () => ({
    send: async (mail: unknown) => {
      fake.mailerOutbox.push(mail);
      return fake.mailerSend;
    },
  }),
}));

vi.mock("@/lib/payments/status-token", () => ({
  createStatusToken: () => ({
    token: "STK-fresh-123",
    hash: "fresh-hash",
    expiresAt: new Date("2026-12-31T00:00:00Z"),
  }),
  hashStatusToken: (t: string) => `h(${t})`,
  defaultStatusTokenExpiry: () => new Date("2026-12-31T00:00:00Z"),
}));

type NotifyModule = typeof import("@/lib/payments/notify");
let notifyPaymentConfirmed: NotifyModule["notifyPaymentConfirmed"];
let notifyPaymentRejected: NotifyModule["notifyPaymentRejected"];

beforeAll(async () => {
  ({ notifyPaymentConfirmed, notifyPaymentRejected } = await import("@/lib/payments/notify"));
});

function givenOrder(reference: string, totalDa: number, email: string | null) {
  fake.ordersQueue.push({
    data: {
      reference,
      total_da: totalDa,
      customers: { email },
    } as unknown as Record<string, unknown>,
  } as Record<string, unknown>);
}

beforeEach(() => {
  fake.ordersQueue = [];
  fake.outboxQueue = [];
  fake.outboxSelectSettle = null;
  fake.outboxUpdates = [];
  fake.outboxInserts = [];
  fake.rpcCalls = [];
  fake.mailerOutbox = [];
  fake.mailerSend = true;
});

describe("notifyPaymentConfirmed — droit ouvert une fois, e-mail une fois", () => {
  it("premier appel : outbox réservée, jeton renouvelé, e-mail envoyé avec lien de suivi, outbox envoyée", async () => {
    givenOrder("TKF-2601-AB34", 3800, "client@example.com");
    fake.outboxSelectSettle = { data: [{ id: "outbox-1" }], error: null };

    const result = await notifyPaymentConfirmed({ paymentId: "p-1", orderId: "o-1" });

    expect(result.status).toBe("sent");
    expect(fake.outboxInserts[0]).toMatchObject({
      payment_id: "p-1",
      event_type: "payment_confirmed",
      recipient: "client@example.com",
    });
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]?.name).toBe("renew_order_status_token");
    expect(fake.rpcCalls[0]?.args).toMatchObject({
      p_order_id: "o-1",
      p_new_status_token_hash: "fresh-hash",
    });
    expect(fake.mailerOutbox).toHaveLength(1);
    const mail = fake.mailerOutbox[0] as {
      to: string;
      subject: string;
      text: string;
      subjectKey: string;
    };
    expect(mail.to).toBe("client@example.com");
    expect(mail.subject).toContain("TKF-2601-AB34");
    expect(mail.subjectKey).toBe("payment.notify.confirmed");
    expect(mail.text).toContain("3800 DA");
    expect(mail.text).toContain("/fr/orders/status?token=STK-fresh-123");
    expect(fake.outboxUpdates[0]).toMatchObject({ status: "sent" });
  });

  it("rejeu : outbox occupée (0 ligne rendue) ⇒ skipped_replay, AUCUN renew ni envoi — envoi idempotent", async () => {
    givenOrder("TKF-2601-AB34", 3800, "client@example.com");
    fake.outboxSelectSettle = { data: [], error: null };

    const result = await notifyPaymentConfirmed({ paymentId: "p-1", orderId: "o-1" });

    expect(result.status).toBe("skipped_replay");
    expect(fake.mailerOutbox).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.outboxUpdates).toHaveLength(0);
  });

  it("commande sans e-mail ⇒ no_email, rien d'autre (pas d'outbox cybersécurité)", async () => {
    givenOrder("TKF-2601-CD56", 2000, null);

    const result = await notifyPaymentConfirmed({ paymentId: "p-2", orderId: "o-2" });

    expect(result.status).toBe("no_email");
    expect(fake.outboxInserts).toHaveLength(0);
    expect(fake.mailerOutbox).toHaveLength(0);
  });

  it("mailer refuse ⇒ outbox marquée failed, résultat failed, exception neutralisée", async () => {
    givenOrder("TKF-2601-AB34", 3800, "client@example.com");
    fake.outboxSelectSettle = { data: [{ id: "outbox-2" }], error: null };
    fake.mailerSend = false;

    const result = await notifyPaymentConfirmed({ paymentId: "p-1", orderId: "o-1" });

    expect(result.status).toBe("failed");
    expect(fake.mailerOutbox).toHaveLength(1); // le mailer a bien été appelé (rejection drainée)
    expect(fake.outboxUpdates[0]).toMatchObject({
      status: "failed",
      last_error: "mailer_refused",
    });
  });
});

describe("notifyPaymentRejected — message neutre avec marche à suivre", () => {
  it("e-mail neutre : aucune référence de transaction, aucune mention de motif interne ; PAS de jeton renouvelé", async () => {
    givenOrder("TKF-2601-AB34", 3800, "client@example.com");
    fake.outboxSelectSettle = { data: [{ id: "outbox-3" }], error: null };

    const result = await notifyPaymentRejected({ paymentId: "p-3", orderId: "o-3" });

    expect(result.status).toBe("sent");
    expect(fake.mailerOutbox).toHaveLength(1);
    const mail = fake.mailerOutbox[0] as { subject: string; text: string; subjectKey: string };
    expect(mail.subjectKey).toBe("payment.notify.rejected");
    expect(mail.subject).toContain("TKF-2601-AB34");
    expect(mail.text).not.toMatch(/motif|rejected| withdrawal|needs_admin|transacti/i);
    expect(mail.text).toContain("Marche à suivre");
    expect(mail.text).toContain("WhatsApp");
    expect(fake.rpcCalls).toHaveLength(0); // pas de renouvellement de jeton au rejet
    expect(fake.outboxUpdates[0]).toMatchObject({ status: "sent" });
  });
});
