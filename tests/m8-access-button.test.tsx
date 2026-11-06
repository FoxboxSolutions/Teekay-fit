// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { AccessButton } from "@/components/orders/access-button";
import messages from "../messages/fr.json";

/**
 * M8 (bloc 3b) — Bouton « Accéder à mon espace » (page de suivi) :
 *  - POST /api/auth/access { statusToken } au clic ;
 *  - message final TOUJOURS identique, quel que soit le résultat
 *    (succès, réponse non-200, erreur réseau) — aucune distinction ;
 *  - le composant n'affiche jamais de détail d'erreur ni de donnée.
 */

const TOKEN = "A".repeat(24);

function renderButton() {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <AccessButton statusToken={TOKEN} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccessButton — relance d'accès (M8)", () => {
  it("TEST NOMMÉ : clic ⇒ POST /api/auth/access avec le jeton, puis message neutre identique (succès)", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Accéder à mon espace" }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/access");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ statusToken: TOKEN });

    const message = screen.getByRole("status");
    expect(message).toBeTruthy();
    expect(message.textContent).toContain("Demande enregistrée");
    // Le message est celui des messages fr (même libellé).
    expect(message.textContent).toBe(messages.order.status.accessSent);
  });

  it("TEST NOMMÉ : réponse d'échec ou erreur réseau ⇒ EXACTEMENT le même message (aucune distinction observable)", async () => {
    const expected = messages.order.status.accessSent;

    // a) Réponse serveur non-200 (ex. commande non payée ⇒ { ok: true }… ou 429).
    const failing = vi.fn(async () => new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", failing);
    const first = renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Accéder à mon espace" }));
    const messageA = screen.getByRole("status");
    expect(messageA.textContent).toBe(expected);
    first.unmount();

    // b) Erreur réseau (fetch rejette).
    const rejecting = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", rejecting);
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Accéder à mon espace" }));
    const messageB = screen.getByRole("status");
    expect(messageB.textContent).toBe(expected);

    // Aucune donnée technique exposée.
    expect(messageB.textContent).not.toContain("Error");
    expect(messageB.textContent).not.toContain("429");
    expect(messageB.textContent).not.toContain(TOKEN);
  });

  it("TEST NOMMÉ : après envoi, le bouton disparaît (pas de double envoi possible)", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Accéder à mon espace" }));
    expect(screen.queryByRole("button")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
