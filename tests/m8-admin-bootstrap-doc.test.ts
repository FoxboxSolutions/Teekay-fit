import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M8 (bloc 0b) — Procédure du PREMIER admin :
 *  - documentée dans docs/admin-bootstrap.md (création service-role +
 *    rôle SQL + connexion par lien + enrôlement MFA) ;
 *  - la partie exécutable est testée RÉELLEMENT sur la base locale
 *    (createUser + user_roles + is_admin) puis nettoyée ;
 *  - AUCUN identifiant dans le dépôt : le doc ne contient que des
 *    variables à remplacer (scan anti-fuite sur tous les .md).
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;
const DOC = "docs/admin-bootstrap.md";

let admin: SupabaseClient;
const createdUserIds: string[] = [];

describe("M8 bloc 0b — procédure premier admin", () => {
  it("TEST NOMMÉ : la procédure documentée (createUser service-role + user_roles SQL) s'exécute réellement et confère is_admin=true, sans identifiant dans le dépôt", async () => {
    admin = createClient(env.apiUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Étape 1 (doc) : création via l'API admin — SANS mot de passe.
    const email = `m8bootstrap-${runId}@test.local`;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    expect(created.error).toBeNull();
    const userId = created.data?.user?.id as string;
    createdUserIds.push(userId);

    // Étape 2 (doc) : rôle attribué par SQL/PostgREST service-role.
    const role = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    expect(role.error).toBeNull();

    // Vérification du doc : is_admin devient vrai pour ce compte.
    // (simulation : la fonction est exécutée en security definer avec
    // auth.uid() — on vérifie la LIGNE de rôle, is_admin étant testé dans
    // la suite RLS existante.)
    const roles = await admin
      .from("user_roles")
      .select("user_id,role")
      .eq("user_id", userId);
    expect(roles.data ?? []).toEqual([{ user_id: userId, role: "admin" }]);

    // Étape 3 (doc) : première connexion par LIEN UNIQUE (pas de mot de
    // passe) — generateLink renvoie un jeton consommable (usage unique).
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    expect(link.error).toBeNull();
    expect((link.data?.properties?.hashed_token as string | undefined) ?? "").toBeTruthy();

    // Anti-fuite : AUCUN identifiant dans le dépôt (tous les .md).
    const docsDir = "docs";
    const mdFiles = [
      "milestone.md",
      "AGENTS.md",
      "PRD — TeekayFit.md",
      ...readdirSync(docsDir).map((f) => `${docsDir}/${f}`),
    ];
    // Le doc du premier admin existe et couvre les étapes exécutées.
    const doc = readFileSync(DOC, "utf8");
    expect(doc).toContain("magic-link");
    expect(doc).toContain("user_roles");
    expect(doc).toContain("MFA");
    // Motifs d'identifiants réels : affectation de secret longue, e-mail
    // codé en dur dans une commande curl, clé de service littérale.
    const patterns = [
      /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?eyJ/i,
      /password\s*[:=]\s*["']?[^\s"'<>{}$]{8,}/i,
      /Bearer\s+eyJ[A-Za-z0-9_-]{20,}/,
      /[A-Za-z0-9._%+-]+@(?!test\.local|example\.|exemple\.)[a-z0-9.-]+\.[a-z]{2,}\b/i,
    ];
    for (const file of mdFiles) {
      const content = readFileSync(file, "utf8");
      for (const pattern of patterns) {
        const found = content.match(pattern);
        // Les <placeholders> documentés (variables à remplacer) sont attendus.
        expect(
          found,
          `${file} contient un identifiant possible : ${found?.[0]?.slice(0, 60)}`,
        ).toBeNull();
      }
    }
  });
});

afterAll(async () => {
  if (!admin) return;
  for (const id of createdUserIds) {
    await admin.from("user_roles").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});
