import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMailer } from "@/lib/mailer/provider";
import { safeNextPath } from "@/lib/auth/redirect-paths";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * M8 (bloc 0a) — Compte client automatique + lien de connexion.
 *
 * Les inscriptions publiques restent DÉSACTIVÉES : le compte est créé par
 * l'API admin (service-role) UNIQUEMENT quand un paiement est confirmé —
 * jamais par une route publique. Le lien de connexion est généré par
 * `admin.generateLink` (jeton à usage unique, durée courte côté GoTrue) et
 * envoyé par NOTRE Mailer via l'outbox idempotent — JAMAIS via
 * signInWithOtp public (le e-mail part de notre domaine, contenu maîtrisé).
 *
 * La liaison customers.profile_id n'a lieu qu'APRÈS vérification de
 * l'e-mail par le lien (route /auth/confirm) — jamais à la seule vue d'un
 * e-mail. Elle est idempotente, couvre toutes les lignes du même e-mail
 * normalisé (trim + minuscules) et ne touche jamais une ligne déjà liée à
 * un autre utilisateur (SQL : link_customers_to_profile).
 */

const APP_URL_FALLBACK = "http://localhost:3000";

/** Normalisation e-mail : trim + minuscules (forme stockée et comparée). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Identifiant du compte existant pour cet e-mail (RPC service-role), ou
 * null. Sert de garde AVANT `generateLink` : sur certaines versions de
 * GoTrue, générer un lien `magiclink` pour une adresse inconnue CRÉE le
 * compte. La connexion ne doit jamais créer d'utilisateur.
 */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    "find_auth_user_id_by_email",
    { p_email: normalizeEmail(email) },
  );
  if (error) throw new Error(error.message);
  return typeof data === "string" && data ? data : null;
}

/** Compte client existant ou créé (jamais de doublon). */
export type EnsureAccountResult = {
  userId: string;
  email: string;
  /** true si le compte vient d'être créé, false s'il existait déjà. */
  created: boolean;
};

/**
 * Crée le compte client (API admin, e-mail pré-vérifié — l'identité est
 * déjà établie par la commande) SANS mot de passe : la connexion se fait
 * par lien unique uniquement. Lie ensuite toutes les lignes customers du
 * même e-mail. Idempotent : un compte existant est réutilisé sans doublon.
 */
export async function ensureCustomerAccount(input: {
  email: string;
  name?: string | null;
}): Promise<EnsureAccountResult> {
  const admin = createSupabaseAdminClient();
  const email = normalizeEmail(input.email);

  const findUser = async (): Promise<string | null> => {
    // La fonction SQL renvoie un SCALAIRE (uuid ou null) — jamais un tableau.
    const { data, error } = await admin.rpc("find_auth_user_id_by_email", {
      p_email: email,
    });
    if (error) throw new Error(error.message);
    return typeof data === "string" && data ? data : null;
  };

  let userId = await findUser();
  let created = false;

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      ...(input.name ? { user_metadata: { full_name: input.name } } : {}),
    });
    if (error || !data?.user) {
      // Course benign : un autre processus a créé le compte entre-temps —
      // on retente la recherche avant d'échouer.
      userId = await findUser();
      if (!userId) {
        throw new Error(
          error?.message ?? "createUser: reponse illisible",
        );
      }
    } else {
      userId = data.user.id;
      created = true;
    }
  }

  await linkCustomers({ admin, email, userId });
  return { userId, email, created };
}

/** Liaison customers.profile_id (RPC service-role, idempotente). */
async function linkCustomers(input: {
  admin: SupabaseClient;
  email: string;
  userId: string;
}): Promise<void> {
  const { error } = await input.admin.rpc("link_customers_to_profile", {
    p_email: input.email,
    p_profile_id: input.userId,
  });
  if (error) throw new Error(error.message);
}

/** Appelée APRÈS verifyOtp réussi (e-mail vérifié par le lien). */
export async function linkCustomersAfterVerify(input: {
  email: string;
  userId: string;
}): Promise<void> {
  await linkCustomers({
    admin: createSupabaseAdminClient(),
    email: normalizeEmail(input.email),
    userId: input.userId,
  });
}

export type LoginLink = {
  /** URL ABSOLUE de /auth/confirm (token_hash + type + next encodé). */
  url: string;
};

/**
 * Construit l'URL de confirmation locale depuis un lien d'action GoTrue :
 * on n'envoie JAMAIS l'action_link (il passe par /auth/v1/verify) — seul le
 * token_hash extrait est recopié dans NOTRE page /auth/confirm (POST).
 * `next` passe par la liste blanche stricte (`safeNextPath`).
 */
export function buildConfirmUrl(input: {
  hashedToken: string;
  next?: string | null;
}): LoginLink {
  const base = process.env.NEXT_PUBLIC_APP_URL || APP_URL_FALLBACK;
  const next = safeNextPath(input.next);
  const url = new URL("/auth/confirm", base);
  url.searchParams.set("token_hash", input.hashedToken);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", next);
  return { url: url.toString() };
}

/** Génère le lien de connexion (usage unique, durée courte côté GoTrue). */
export async function createLoginLink(input: {
  email: string;
  next?: string | null;
}): Promise<LoginLink> {
  // Garde anti-création : une adresse inconnue ne doit JAMAIS produire de
  // compte (generateLink peut créer l'utilisateur selon la version GoTrue).
  if (!(await findAuthUserIdByEmail(input.email))) {
    throw new Error("account_not_found");
  }

  const admin = createSupabaseAdminClient();
  const next = safeNextPath(input.next);
  const base = process.env.NEXT_PUBLIC_APP_URL || APP_URL_FALLBACK;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalizeEmail(input.email),
    options: { redirectTo: `${base}${next}` },
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(error?.message ?? "generateLink: reponse illisible");
  }
  return buildConfirmUrl({
    hashedToken: data.properties.hashed_token,
    next: input.next,
  });
}

export type PdfAccessStatus = "sent" | "failed" | "skipped_replay" | "no_email";

/**
 * E-mail « accès aux PDF » (M8) : enregistré dans l'outbox idempotent
 * (unique payment_id + 'pdf_access') puis envoyé via le Mailer. Le contenu
 * ne contient NI fichier NI lien de téléchargement — SEULEMENT le lien de
 * connexion vers l'espace client (le droit reste vérifié côté serveur à
 * chaque téléchargement). L'échec est never-fatal.
 */
export async function notifyPdfAccess(input: {
  paymentId: string;
  orderId: string;
  /** Injection test (défaut : getMailer()). */
  mailer?: ReturnType<typeof getMailer>;
}): Promise<{ status: PdfAccessStatus }> {
  try {
    const admin = createSupabaseAdminClient();

    const { data: rows, error } = await admin
      .from("orders")
      .select("id,customers(email)")
      .eq("id", input.orderId)
      .limit(1);
    if (error || !rows || rows.length === 0) return { status: "no_email" };
    const order = rows[0] as unknown as { customers: { email: string | null } | null };
    const email = order.customers?.email;
    if (!email) return { status: "no_email" };

    // 1) Réservation outbox : unique(payment_id, 'pdf_access') — un rejeu
    //    n'insère rien ⇒ aucun double envoi possible.
    const inserted = await admin
      .from("email_outbox")
      .insert({
        payment_id: input.paymentId,
        event_type: "pdf_access",
        recipient: normalizeEmail(email),
      })
      .select("id");
    if (!inserted.data || !Array.isArray(inserted.data) || inserted.data.length === 0) {
      return { status: "skipped_replay" };
    }
    const outboxId = (inserted.data[0] as { id: string }).id;

    // 2) Compte (idempotent) + lien de connexion (usage unique).
    await ensureCustomerAccount({ email });
    const link = await createLoginLink({ email, next: "/fr/account" });

    // 3) Envoi via le Mailer configurable (lien de connexion SEULEMENT).
    const mailer = input.mailer ?? getMailer();
    const sent = await mailer.send({
      to: normalizeEmail(email),
      subjectKey: "account.accessEmail",
      params: {},
      subject: "Teekay Fit — accéder à votre espace et vos PDF",
      text: [
        "Bonjour,",
        "",
        "Votre paiement est confirmé : vos fichiers sont disponibles dans",
        "votre espace client.",
        "",
        `Connexion (lien unique, valable une fois) : ${link.url}`,
        "",
        "Ce lien ne contient aucun fichier : la connexion est requise, et le",
        "téléchargement reste vérifié côté serveur.",
        "",
        "L'équipe Teekay Fit.",
      ].join("\n"),
    });

    await admin
      .from("email_outbox")
      .update({
        status: sent ? "sent" : "failed",
        sent_at: sent ? new Date().toISOString() : null,
        last_error: sent ? null : "mailer_refused",
      })
      .eq("id", outboxId);

    return { status: sent ? "sent" : "failed" };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "pdf_access_notify_failed",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    return { status: "failed" };
  }
}
