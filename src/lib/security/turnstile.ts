import "server-only";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 5_000;

/**
 * Clés de test Cloudflare (« Test your Turnstile implementation ») : le sitekey
 * visible `1x…AA` émet toujours le jeton d'équipe `XXXX.DUMMY.TOKEN.XXXX` et le
 * secret `1x…AA` accepte toujours. À utiliser uniquement en dev/test.
 */
export const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

type SiteverifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
  hostname?: string;
};

const refuse = (event: string, detail: Record<string, unknown> = {}): false => {
  console.error(JSON.stringify({ level: "error", event, ...detail }));
  return false;
};

/**
 * Vérification serveur du jeton Turnstile via siteverify (PRD §15).
 *
 * Échec fermé : secret ou jeton absent, réseau inaccessible, réponse non
 * `success`, ou hostname inattendu ⇒ la soumission est refusée.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return refuse("turnstile_secret_absent");
  if (!token) return refuse("turnstile_jeton_absent");

  // Les clés de test acceptent n'importe quel jeton : hors localhost elles
  // désactiveraient le captcha — refus explicite (échec fermé).
  if (secret === TURNSTILE_TEST_SECRET_KEY && !appIsLocalhost()) {
    return refuse("turnstile_cle_de_test_hors_local");
  }

  let payload: SiteverifyResponse;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) return refuse("turnstile_siteverify_hors_service", { status: response.status });
    payload = (await response.json()) as SiteverifyResponse;
  } catch (error) {
    return refuse("turnstile_siteverify_injoignable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (payload.success !== true) {
    return refuse("turnstile_jeton_refuse", { errorCodes: payload["error-codes"] ?? [] });
  }

  const expected = appHostname();
  if (expected && payload.hostname && payload.hostname !== expected) {
    return refuse("turnstile_hostname_inattendu", {
      attendu: expected,
      recu: payload.hostname,
    });
  }

  return true;
}

function appHostname(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

function appIsLocalhost(): boolean {
  const host = appHostname();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
