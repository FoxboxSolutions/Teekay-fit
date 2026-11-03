import { CaptureMailer, NullMailer, type Mail, type Mailer } from "@/lib/mailer/mailer";
import { isProductionLike } from "@/lib/env";

/**
 * Sélection du Mailer PAR VARIABLES D'ENVIRONNEMENT (aucune valeur en dur) :
 *  - MAILER_PROVIDER=capture → CaptureMailer (tests, démo locale) ;
 *  - MAILER_PROVIDER=resend  → ResendMailer (HTTP Resend, fetch natif —
 *    aucune dépendance ajoutée ; exige RESEND_API_KEY + MAIL_FROM) ;
 *  - absent (dev/test explicites APP_ENV) → CaptureMailer ;
 *  - absent ou MAL CONFIGURÉ en prod-like → NullMailer + erreur journalisée
 *    (jamais d'envoi silencieux jamais envoyé, jamais de crash sur l'e-mail).
 *
 * Les clés ne sont JAMAIS lues ici pour être loguées — seulement pour
 * décider. Un oubli est visible sur /api/health et par l'erreur journalisée.
 */
export type MailerOptions = {
  /** Défaut : process.env.MAILER_PROVIDER. */
  provider?: string;
  /** Défaut : process.env.APP_ENV (défaut sûr = prod-like). */
  appEnv?: string;
};

export class ResendMailer implements Mailer {
  async send(mail: Mail): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY ?? "";
    const from = process.env.MAIL_FROM ?? "";
    if (!apiKey || !from || !mail.subject || !mail.text) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "mailer_send_refused",
          reason: "mailer_incomplete_config",
        }),
      );
      return false;
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
      });
      // Rejet (4xx/5xx, quota, adresse invalide) : false — l'appelant
      // marque l'envoi échoué et reste NEUTRE vis-à-vis du client.
      return response.ok;
    } catch {
      console.error(
        JSON.stringify({ level: "error", event: "mailer_send_network_error" }),
      );
      return false;
    }
  }
}

function logMailerDecision(event: string, detail: string | null): void {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      detail,
    }),
  );
}

export function getMailer(options: MailerOptions = {}): Mailer {
  const provider = options.provider ?? process.env.MAILER_PROVIDER;
  const appEnv = options.appEnv ?? process.env.APP_ENV;

  if (provider === "capture") return new CaptureMailer();

  if (provider === "resend") {
    if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) {
      return new ResendMailer();
    }
    logMailerDecision("mailer_misconfigured", "resend_sans_cle");
    return new NullMailer();
  }

  if (provider !== undefined && provider !== "") {
    // Valeur inconnue : jamais de repli silencieux vers un faux envoi.
    logMailerDecision("mailer_misconfigured", `provider_inconnu:${provider}`);
    return new NullMailer();
  }

  if (isProductionLike(appEnv)) {
    logMailerDecision("mailer_unconfigured", "prod_like_null");
    return new NullMailer();
  }

  // Dev/test explicites (development/preview) : capture locale.
  return new CaptureMailer();
}
