// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { AptitudeForm } from "@/components/site/aptitude-form";
import messages from "../messages/fr.json";

// jsdom n'implémente pas ResizeObserver (utilisé par les primitives Radix).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub;

function clickRadio(name: string, value: string) {
  const el = document.querySelector(
    `input[name="${name}"][value="${value}"]`,
  ) as HTMLInputElement | null;
  if (!el) throw new Error(`radio ${name}=${value} introuvable`);
  el.click();
}

beforeAll(() => {
  // Environnement de test : on s'assure que le stockage est vide au départ.
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterAll(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AptitudeForm (PAR-Q) — aucune persistance ni réseau", () => {
  it("remplir et valider n'écrit ni stockage, ni URL, ni appel réseau", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const hrefBefore = window.location.href;
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="fr" messages={messages}>
        <AptitudeForm />
      </NextIntlClientProvider>,
    );

    // PAR-Q : oui/non sur les 6 questions (choix structurés, jamais de texte libre).
    for (const q of ["q1", "q2", "q3", "q4", "q5", "q6"]) {
      clickRadio(q, "no");
    }

    // Objectif, disponibilité (selects).
    await user.selectOptions(screen.getByLabelText("Objectif principal"), "poids");
    await user.selectOptions(screen.getByLabelText("Disponibilité"), "s23");

    // Expérience, environnement (radios).
    clickRadio("experience", "beginner");
    clickRadio("equipment", "gym");

    // Au moins une discipline (case à cocher Radix).
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    // Décharge obligatoire.
    await user.click(screen.getByLabelText(/décharge/i));

    await user.click(screen.getByRole("button", { name: "Valider le questionnaire" }));

    // Message de confirmation (état mémoire uniquement).
    expect(
      screen.getByText(/Questionnaire complété/i),
    ).toBeTruthy();

    // Aucune écriture de stockage.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    // Aucun appel réseau.
    expect(fetchSpy).not.toHaveBeenCalled();

    // Aucune modification d'URL (pas de query/hash avec les réponses).
    expect(window.location.href).toBe(hrefBefore);
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("n'écrit rien en stockage pendant la simple saisie (avant validation)", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="fr" messages={messages}>
        <AptitudeForm />
      </NextIntlClientProvider>,
    );

    clickRadio("q1", "yes");
    clickRadio("q2", "no");
    await user.selectOptions(screen.getByLabelText("Objectif principal"), "muscle");

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.search).toBe("");
  });
});
