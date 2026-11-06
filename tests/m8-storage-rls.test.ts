import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M8 (bloc 1) — Stockage privé `offer-files` :
 *  - bucket existant, PUBLIC = false (aucune URL publique) ;
 *  - RLS storage.objects : AUCUNE policy — anon et authenticated refusés
 *    partout (upload, lecture, liste) : refus PAR DÉFAUT, deviner une URL
 *    ne donne rien ;
 *  - service-role : accès serveur complet (dépôt manuel Starter + lecture
 *    pour filigranage à la volée) ;
 *  - la source reste privée : seule la route /api/downloads sert un PDF
 *    filigrané (testé en bloc 2c).
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;
const BUCKET = "offer-files";
const PATH = `starter/fixture-${runId}.pdf`;

let admin: SupabaseClient;
let anon: SupabaseClient;
let authed: SupabaseClient;

async function uploadOk(client: SupabaseClient, path: string): Promise<boolean> {
  const { error } = await client.storage.from(BUCKET).upload(path, Buffer.from("%PDF-1.4 test"), {
    contentType: "application/pdf",
    upsert: false,
  });
  return error === null;
}

beforeAll(async () => {
  admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Authentifié sans aucun rôle (un simple client ne doit rien lire non plus).
  const email = `m8storage-${runId}@test.local`;
  await admin.auth.admin.createUser({ email, password: `Str0ng-${runId}-p`, email_confirm: true });
  authed = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await authed.auth.signInWithPassword({ email, password: `Str0ng-${runId}-p` });
  if (error) throw new Error(error.message);
}, 120_000);

afterAll(async () => {
  if (admin) {
    await admin.storage.from(BUCKET).remove([PATH]).catch(() => undefined);
    await admin
      .auth.admin
      .listUsers({ page: 1, perPage: 200 })
      .then(({ data }) => {
        const target = (data?.users ?? []).find((u) => u.email === `m8storage-${runId}@test.local`);
        return target ? admin.auth.admin.deleteUser(target.id) : null;
      })
      .catch(() => undefined);
  }
});

describe("M8 bloc 1 — bucket offer-files privé, RLS refus par défaut", () => {
  it("TEST NOMMÉ : bucket privé (public=false) — anon/authenticated n'ont AUCUN accès (upload, lecture, liste) ; deviner un chemin ne donne rien", async () => {
    const buckets = await admin.storage.listBuckets();
    const bucket = (buckets.data ?? []).find((b) => b.name === BUCKET);
    expect(bucket).toBeTruthy();
    expect(bucket?.public).toBe(false);

    for (const client of [anon, authed]) {
      // Upload refusé (aucune policy d'insertion).
      expect(await uploadOk(client, PATH)).toBe(false);
      // Liste vide : pas d'erreur révélante, mais RIEN d'exposable.
      const list = await client.storage.from(BUCKET).list("starter");
      expect(list.error).toBeNull();
      expect(list.data ?? []).toEqual([]);
      // Lecture directe du chemin deviné : refusée.
      const dl = await client.storage.from(BUCKET).download(PATH);
      expect(dl.error).not.toBeNull();
      expect(dl.data).toBeNull();
      // URL signée : refusée (pas de permission de sélection).
      const signed = await client.storage.from(BUCKET).createSignedUrl(PATH, 300);
      expect(signed.error).not.toBeNull();
      expect(signed.data?.signedUrl).toBeUndefined();
    }
  });

  it("service-role : upload puis lecture (dépôt manuel Starter + filigranage serveur) — le seul accès autorisé", async () => {
    expect(await uploadOk(admin, PATH)).toBe(true);

    const signed = await admin.storage.from(BUCKET).createSignedUrl(PATH, 300);
    expect(signed.error).toBeNull();
    expect(signed.data?.signedUrl).toContain("offer-files");

    const dl = await admin.storage.from(BUCKET).download(PATH);
    expect(dl.error).toBeNull();
    expect((await dl.data?.text()) ?? "").toContain("%PDF-");
  });
});
