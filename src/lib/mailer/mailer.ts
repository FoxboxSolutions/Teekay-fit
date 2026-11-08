import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Interface Mailer (M6, décision amendement 10) : tout envoi d'e-mail
 * transactionnel (confirmation de commande neutre, lien magique — M7)
 * passe par cette interface. Une seule implémentation de production
 * arrivera avec le SMTP Supabase (point ouvert : domaine teekay.fit,
 * SPF/DKIM/DMARC) ; les tests utilisent l'implémentation de capture.
 *
 * Aucun secret ici ; le contenu doit rester I18N-ready (clés de messages
 * côté appelant, jamais de texte en dur dans le Mailer).
 */
export interface Mail {
  to: string;
  /** Clé i18n du libellé de l'e-mail (ex. "order.confirmationEmail"). */
  subjectKey: string;
  /** Paramètres de traduction (jamais de texte déjà traduit en dur ici). */
  params: Record<string, string | number>;
  /**
   * Sujet résolu, prêt à transmettre (appli monolingue fr : l'appelant porte
   * le texte). Requis par les providers RÉELS (Resend) ; la clé i18n reste
   * la source documentaire du libellé.
   */
  subject?: string;
  /** Corps texte brut résolu — requis par les providers réels. */
  text?: string;
}

export interface Mailer {
  /** Renvoie true si l'e-mail a été transmis à l'agent (pas d'oracle métier). */
  send(mail: Mail): Promise<boolean>;
}

/**
 * Implémentation de TEST : capture locale en mémoire, aucun réseau.
 * Utilisée par vitest (et comme repli explicite quand aucune messagerie
 * n'est configurée — l'appelant décide de journaliser ou d'ignorer).
 *
 * Sink fichier OPTIONNEL (E2E / démo locale) : si MAILER_CAPTURE_FILE est
 * défini, chaque e-mail est aussi ajouté en JSONL (append-only) — c'est le
 * seul moyen pour Playwright de lire le VRAI lien de connexion envoyé par
 * l'application (GoTrue `generateLink` n'envoie AUCUN e-mail, le Mailer est
 * la seule voie). Aucun fichier sinon ; jamais défini en production (le
 * providers réels sont Resend/NullMailer). Une échec d'écriture ne fait
 * JAMAIS échouer un envoi : la capture est best-effort.
 */
function persistCapture(mail: Mail): void {
  const file = process.env.MAILER_CAPTURE_FILE;
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ ...mail, at: new Date().toISOString() })}\n`, "utf8");
  } catch {
    // Best-effort : la capture ne doit jamais casser un envoi d'e-mail.
  }
}

export class CaptureMailer implements Mailer {
  readonly outbox: Mail[] = [];

  async send(mail: Mail): Promise<boolean> {
    this.outbox.push(mail);
    persistCapture(mail);
    return true;
  }
}

/** Repli explicite : aucun envoi (aucune exception, jamais de crash sur l'email). */
export class NullMailer implements Mailer {
  async send(): Promise<boolean> {
    return false;
  }
}
