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
}

export interface Mailer {
  /** Renvoie true si l'e-mail a été transmis à l'agent (pas d'oracle métier). */
  send(mail: Mail): Promise<boolean>;
}

/**
 * Implémentation de TEST : capture locale en mémoire, aucun réseau.
 * Utilisée par vitest (et comme repli explicite quand aucune messagerie
 * n'est configurée — l'appelant décide de journaliser ou d'ignorer).
 */
export class CaptureMailer implements Mailer {
  readonly outbox: Mail[] = [];

  async send(mail: Mail): Promise<boolean> {
    this.outbox.push(mail);
    return true;
  }
}

/** Repli explicite : aucun envoi (aucune exception, jamais de crash sur l'email). */
export class NullMailer implements Mailer {
  async send(): Promise<boolean> {
    return false;
  }
}
