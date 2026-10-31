"use client";

import { useEffect, useRef, useState } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetIdOrElement?: string | HTMLElement) => void;
    };
  }
}

interface TurnstileProps {
  /** Jeton émis par le widget (null tant que le défi n'est pas résolu). */
  onToken: (token: string | null) => void;
  /** Légende accessible affichée au-dessus du widget. */
  label: string;
  /** Message d'erreur affiché si le widget échoue (le serveur reste échec fermé). */
  errorLabel: string;
}

/**
 * Widget Cloudflare Turnstile (mode explicite) — anti-spam des formulaires
 * publics. Le jeton n'est qu'une preuve : le serveur le revérifie via
 * siteverify (échec fermé, PRD §15).
 */
export function Turnstile({ onToken, label, errorLabel }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  // Pas de sitekey (env absente) : le widget ne peut pas se charger — échec
  // visible immédiatement, le serveur refuse de toute façon (échec fermé).
  const [failed, setFailed] = useState(() => !process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let disposed = false;

    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
    if (!sitekey) {
      return;
    }

    const render = () => {
      const host = containerRef.current;
      if (disposed || !host || !window.turnstile) return;
      window.turnstile.render(host, {
        sitekey,
        theme: "dark",
        callback: (token: string) => {
          setFailed(false);
          onTokenRef.current(token);
        },
        "error-callback": () => {
          setFailed(true);
          onTokenRef.current(null);
        },
      });
    };

    if (window.turnstile) {
      render();
      return () => {
        disposed = true;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", render);
      return () => {
        disposed = true;
        existing.removeEventListener("load", render);
      };
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", render);
    script.addEventListener("error", () => {
      if (!disposed) setFailed(true);
    });
    document.head.appendChild(script);

    return () => {
      disposed = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div ref={containerRef} className="min-h-11 [&_.cf-turnstile]:max-w-full" />
      {failed && (
        <p role="alert" className="text-sm text-red-text">
          {errorLabel}
        </p>
      )}
    </div>
  );
}
