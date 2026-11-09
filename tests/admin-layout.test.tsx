import { describe, it, expect, vi, beforeAll } from "vitest";

/**
 * M9a — coquille /admin : metadata noindex, shell rend les enfants.
 */
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
}));

type LayoutModule = typeof import("@/app/[locale]/admin/layout");
let layout: LayoutModule["default"];
let generateMetadata: LayoutModule["generateMetadata"];

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

beforeAll(async () => {
  ({ default: layout, generateMetadata } = await import("@/app/[locale]/admin/layout"));
});

describe("layout /admin", () => {
  it("rend ses enfants dans un conteneur mobile-first", async () => {
    const el = await layout({ children: <div>contenu admin</div> });
    const json = JSON.stringify(el);
    expect(json).toContain("contenu admin");
    expect(json).toContain("max-w-4xl");
    expect(json).toContain("px-4");
  });

  it("metadata : titre + noindex (console admin)", async () => {
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe("t:title");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
