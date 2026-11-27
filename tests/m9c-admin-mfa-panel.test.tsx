// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { AdminMfaPanel } from "@/components/admin/mfa-panel";
import messages from "../messages/fr.json";

/**
 * M9c — panneau MFA : un facteur vérifié existant imposait un NOUVEL
 * enrôlement. Désormais :
 *  - facteur vérifié + session aal1 ⇒ DÉFI TOTP (challengeAndVerify) ;
 *  - aucun facteur vérifié          ⇒ enrôlement (QR) ;
 *  - session aal2                   ⇒ carte active.
 */

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh }),
}));

beforeEach(() => {
  nav.refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel(props: { alreadyVerified: boolean; verifiedFactorId: string | null }) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <AdminMfaPanel {...props} />
    </NextIntlClientProvider>,
  );
}

describe("AdminMfaPanel — défi vs enrôlement", () => {
  it("TEST NOMMÉ : facteur vérifié + aal1 ⇒ défi TOTP, PAS de génération de QR", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    renderPanel({ alreadyVerified: false, verifiedFactorId: "factor-1" });

    expect(screen.getByRole("heading", { name: messages.admin.mfa.challengeTitle })).toBeTruthy();
    expect(screen.queryByRole("button", { name: messages.admin.mfa.startEnroll })).toBeNull();

    await userEvent.type(screen.getByLabelText(messages.admin.mfa.codeLabel), "123456");
    await userEvent.click(screen.getByRole("button", { name: messages.admin.mfa.challengeSubmit }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/mfa/verify");
    expect(JSON.parse(String(init.body))).toEqual({ factorId: "factor-1", code: "123456" });
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("aucun facteur vérifié ⇒ enrôlement (QR), pas de défi", () => {
    renderPanel({ alreadyVerified: false, verifiedFactorId: null });

    expect(screen.getByRole("button", { name: messages.admin.mfa.startEnroll })).toBeTruthy();
    expect(screen.queryByRole("button", { name: messages.admin.mfa.challengeSubmit })).toBeNull();
  });

  it("session déjà aal2 ⇒ carte active", () => {
    renderPanel({ alreadyVerified: true, verifiedFactorId: "factor-1" });

    expect(screen.getByRole("heading", { name: messages.admin.mfa.activeTitle })).toBeTruthy();
    expect(screen.queryByRole("button", { name: messages.admin.mfa.startEnroll })).toBeNull();
  });
});
