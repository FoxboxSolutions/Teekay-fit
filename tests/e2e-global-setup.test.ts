import { describe, expect, it } from "vitest";
import { assertLocalSupabaseUrl, readSupabaseUrl } from "../e2e/global-setup";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Garde du global setup E2E (correction avant M9) : `supabase db reset` n'est
 * autorisé QUE sur une base LOCALE — le setup REFUSE de tourner si l'URL
 * Supabase n'est pas 127.0.0.1 / localhost. Testé ici sur la fonction de
 * garde (jamais le `db reset` réel).
 */
describe("global setup E2E — garde « base Supabase locale uniquement »", () => {
  it("accepte une URL locale (127.0.0.1, localhost, ::1 — port libre)", () => {
    expect(() => assertLocalSupabaseUrl("http://localhost:54470")).not.toThrow();
    expect(() => assertLocalSupabaseUrl("http://127.0.0.1:54470")).not.toThrow();
    expect(() => assertLocalSupabaseUrl("http://[::1]:54470")).not.toThrow();
    expect(() => assertLocalSupabaseUrl("https://127.0.0.1")).not.toThrow();
  });

  it("REFUSE une URL non locale — hébergé, domaine, IP privée, non parsable ou absente", () => {
    for (const url of [
      "https://abcproj.supabase.co",
      "https://teekay.fit:5432",
      "http://10.0.0.9:54470",
      "http://192.168.1.4:54470",
      "supabase-co-prod",
      "",
      null,
      undefined,
    ]) {
      expect(() => assertLocalSupabaseUrl(url), `devrait refuser : ${String(url)}`).toThrow(
        /Supabase doit être LOCAL|refusé/i,
      );
    }
  });

  it("lit NEXT_PUBLIC_SUPABASE_URL : process.env prioritaire, sinon .env local, sinon null ⇒ les E2E refuseront", () => {
    const root = mkdtempSync(path.join(tmpdir(), "e2e-setup-"));
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      // 1) process.env prioritaire (là, l'URL locale est déjà injectée).
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54470";
      expect(readSupabaseUrl(root)).toBe("http://127.0.0.1:54470");
      // 2) sans process.env : lecture de `.env.local` (guillemés retirés)…
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      writeFileSync(
        path.join(root, ".env.local"),
        'NEXT_PUBLIC_SUPABASE_URL="http://localhost:54470"\n',
      );
      expect(readSupabaseUrl(root)).toBe("http://localhost:54470");
      // 3) ni l'un ni l'autre (.env.local inexistant) ⇒ null : le setup refusera.
      rmSync(path.join(root, ".env.local"), { force: true });
      expect(readSupabaseUrl(root)).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
      mkdirSync(root, { recursive: true }); // répertoire garanti pour le nettoyage de l'OS
    }
  });
});
