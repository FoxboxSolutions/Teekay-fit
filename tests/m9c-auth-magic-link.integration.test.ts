import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getLocalEnv } from "./helpers/env";

/**
 * M9c — preuves d'intégration contre le Supabase LOCAL :
 *  1. POST /api/auth/magic-link avec un e-mail INCONNU ne crée AUCUN
 *     utilisateur (count auth.users inchangé, lookup toujours null) ;
 *  2. le corps de réponse est identique (compte connu / inconnu) et la
 *     latence reste comparable (plancher neutre) ;
 *  3. un token_hash est à USAGE UNIQUE : le second verifyOtp échoue, pour
 *     un compte admin comme pour un compte client.
 *
 * Aucune adresse réelle : tout est synthétique et supprimé en afterAll.
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;
const UNKNOWN_EMAIL = `m9c-unknown-${runId}@test.local`;
const CLIENT_EMAIL = `m9c-client-${runId}@test.local`;
const ADMIN_EMAIL = `m9c-admin-${runId}@test.local`;
const CAPTURE_FILE = resolve("test-results/m9c-mailer-capture.ndjson");
const NEUTRAL_BODY = '{"ok":true}';

let admin: SupabaseClient;
let anon: SupabaseClient;
let route: typeof import("@/app/api/auth/magic-link/route");
let userIds: string[] = [];

function request(email: string, next = "/fr/account"): Request {
  return new Request("http://localhost/api/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.77" },
    body: JSON.stringify({ email, next }),
  });
}

async function countUsers(): Promise<number> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return (data as { total?: number }).total ?? data.users.length;
}

async function findUserId(email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("find_auth_user_id_by_email", { p_email: email });
  if (error) throw error;
  return typeof data === "string" && data ? data : null;
}

function captureLines(): Array<{ to: string; text?: string }> {
  if (!existsSync(CAPTURE_FILE)) return [];
  return readFileSync(CAPTURE_FILE, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { to: string; text?: string });
}

beforeAll(async () => {
  mkdirSync(dirname(CAPTURE_FILE), { recursive: true });
  if (existsSync(CAPTURE_FILE)) rmSync(CAPTURE_FILE);

  process.env.NEXT_PUBLIC_SUPABASE_URL = env.apiUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.MAILER_PROVIDER = "capture";
  process.env.MAILER_CAPTURE_FILE = CAPTURE_FILE;
  process.env.RATE_LIMIT_SALT = `test-salt-m9c-${runId}`;

  admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const client = await admin.auth.admin.createUser({ email: CLIENT_EMAIL, email_confirm: true });
  if (client.error || !client.data.user) throw client.error ?? new Error("client non créé");
  const adminUser = await admin.auth.admin.createUser({ email: ADMIN_EMAIL, email_confirm: true });
  if (adminUser.error || !adminUser.data.user) throw adminUser.error ?? new Error("admin non créé");

  userIds = [client.data.user.id, adminUser.data.user.id];
  const role = await admin.from("user_roles").insert({
    user_id: adminUser.data.user.id,
    role: "admin",
  });
  if (role.error) throw role.error;

  route = await import("@/app/api/auth/magic-link/route");
}, 120_000);

afterAll(async () => {
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
  if (existsSync(CAPTURE_FILE)) rmSync(CAPTURE_FILE);
});

describe("POST /api/auth/magic-link — intégration locale", () => {
  it("TEST NOMMÉ : e-mail inconnu ⇒ AUCUN utilisateur créé (count auth.users inchangé)", async () => {
    const beforeCount = await countUsers();
    const beforeLookup = await findUserId(UNKNOWN_EMAIL);

    const res = await route.POST(request(UNKNOWN_EMAIL));

    const afterCount = await countUsers();
    const afterLookup = await findUserId(UNKNOWN_EMAIL);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(NEUTRAL_BODY);
    expect(beforeLookup).toBeNull();
    expect(afterLookup).toBeNull();
    expect(afterCount).toBe(beforeCount);
    expect(captureLines().some((mail) => mail.to === UNKNOWN_EMAIL)).toBe(false);
  });

  it("e-mail connu ⇒ corps identique, lien token_hash envoyé, next admin conservé", async () => {
    const res = await route.POST(request(CLIENT_EMAIL, "/fr/admin"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(NEUTRAL_BODY);

    const mail = captureLines().find((line) => line.to === CLIENT_EMAIL);
    expect(mail).toBeTruthy();
    const url = String(mail?.text ?? "").match(/https?:\/\/\S+/)?.[0] ?? "";
    expect(url).toContain("/auth/confirm");
    expect(new URL(url).searchParams.get("type")).toBe("magiclink");
    expect(new URL(url).searchParams.get("next")).toBe("/fr/admin");
    expect((new URL(url).searchParams.get("token_hash") ?? "").length).toBeGreaterThanOrEqual(16);
  });

  it("TEST NOMMÉ : un second verifyOtp du même token_hash échoue (admin ET client)", async () => {
    for (const email of [CLIENT_EMAIL, ADMIN_EMAIL]) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (error || !data.properties?.hashed_token) {
        throw error ?? new Error(`token_hash absent pour ${email}`);
      }
      const tokenHash = data.properties.hashed_token;

      const first = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
      expect(first.error, `premier usage (${email})`).toBeNull();
      expect(first.data.session, `session ouverte (${email})`).toBeTruthy();

      const second = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
      expect(second.error, `second usage (${email})`).toBeTruthy();
      expect(second.data.session).toBeNull();
    }
  });

  it("latence comparable : compte connu vs inconnu (plancher neutre)", async () => {
    const knownStart = performance.now();
    const known = await route.POST(request(CLIENT_EMAIL));
    const knownMs = performance.now() - knownStart;
    expect(known.status).toBe(200);
    expect(await known.text()).toBe(NEUTRAL_BODY);

    const unknownStart = performance.now();
    const unknown = await route.POST(request(UNKNOWN_EMAIL));
    const unknownMs = performance.now() - unknownStart;
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toBe(NEUTRAL_BODY);

    expect(knownMs).toBeGreaterThanOrEqual(140);
    expect(unknownMs).toBeGreaterThanOrEqual(140);
    expect(Math.abs(knownMs - unknownMs)).toBeLessThan(80);
  });
});
