import "server-only";
import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import PDFDocument from "pdfkit";

/**
 * Reçu de paiement (M7a bloc 6) — PDF téléchargeable depuis la page de
 * statut (le jeton de statut EST la capacité de téléchargement).
 *
 * COPIE FIGÉE : les valeurs affichées proviennent EXCLUSIVEMENT de la
 * commande telle qu'enregistrée (orders + order_items, « copie figée,
 * jamais recalculée depuis offers » — §5, §8) + l'entête du client.
 * Aucune donnée fraîche de la vitrine n'entre jamais dans le reçu.
 *
 * POLICES : titres en Barlow Condensed (police display du design system,
 * TTF embarqués — licence SIL OFL jointe), corps en Helvetica (police
 * standard PDF : encodage WinAnsi = accents français complets, aucun
 * embed, poids minimal). Une seule lib de génération : pdfkit.
 */

export type ReceiptItem = {
  name: string;
  quantity: number;
  subtotalDa: number;
};

export type ReceiptCopy = {
  reference: string;
  customerName: string;
  customerEmail: string | null;
  offerName: string;
  unitPriceDa: number;
  discountDa: number;
  totalDa: number;
  items: ReceiptItem[];
  paidAtIso: string;
  status: string;
};

export type ReceiptLine = { label: string; value: string; emphasis?: boolean };

const LINE_TITRE = "REÇU";
const BRAND = "TEEKAY FIT";

/** Formatage DA : séparateurs fr en ESPACE SIMPLE (les espaces fines
 * U+202F d'Intl sont transcrites en artefacts de crénage par pdfkit). */
export function formatDA(n: number): string {
  const formatted = new Intl.NumberFormat("fr-FR")
    .format(n)
    .replace(/[\u202f\u00a0]/g, " ");
  return `${formatted} DA`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
}

/**
 * Lignes du reçu, dérivées de la copie figée — C'EST ce contenu qui est
 * testé contre la commande (cohérence reçu ⇄ copie figée), l'écriture PDF
 * ne fait que le tracer.
 */
export function buildReceiptLines(copy: ReceiptCopy): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  lines.push({ label: "Titre", value: LINE_TITRE, emphasis: true });
  lines.push({ label: "Client", value: copy.customerName });
  if (copy.customerEmail) lines.push({ label: "E-mail", value: copy.customerEmail });
  lines.push({ label: "Référence", value: copy.reference });
  lines.push({ label: "Article", value: copy.offerName });
  lines.push({ label: "Prix unitaire", value: formatDA(copy.unitPriceDa) });
  for (const item of copy.items) {
    lines.push({
      label: `Quantité — ${item.name}`,
      value: item.quantity > 1 ? `${item.quantity}` : "1",
    });
  }
  if (copy.discountDa > 0) {
    lines.push({ label: "Remise", value: `− ${formatDA(copy.discountDa)}` });
  }
  lines.push({ label: "TOTAL PAYÉ", value: formatDA(copy.totalDa), emphasis: true });
  lines.push({ label: "Payé le", value: formatDate(copy.paidAtIso) });
  lines.push({
    label: "Moyen de paiement",
    value: "Virement BaridiMob — confirmation manuelle",
  });
  lines.push({ label: "Émetteur", value: BRAND });
  return lines;
}

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

/** Rendu pur (testable sans base) : copie figée → PDF (octets réels). */
export function renderReceiptPdf(copy: ReceiptCopy): Promise<Buffer> {
  return renderPdf(copy, buildReceiptLines(copy));
}

async function renderPdf(
  copy: ReceiptCopy,
  lines: ReceiptLine[],
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
    info: {
      Title: `REÇU — ${copy.reference}`,
      Author: BRAND,
      Producer: "Teekay Fit",
      Subject: "Reçu de paiement BaridiMob",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  // Bandeau marque : police display du design system (OFL). kerning:false
  // (cohérence : chaînes un seul run dans le flux).
  doc
    .registerFont("display-bold", path.join(FONT_DIR, "BarlowCondensed-Bold.ttf"))
    .registerFont("display-semibold", path.join(FONT_DIR, "BarlowCondensed-SemiBold.ttf"))
    .registerFont("body", "Helvetica")
    .registerFont("body-bold", "Helvetica-Bold");

  // En-tête : marque + intitulé REÇU (police display).
  doc.font("display-bold").fontSize(30).fillColor("#000000").text(BRAND);
  doc.moveDown(0.4);
  doc.font("display-semibold").fontSize(18).text(LINE_TITRE);
  doc.moveDown(1.6);

  // Lignes (corps Helvetica) — les espaces Intl sont remplacés par des
  // espaces simples PAR formatDA (les espaces fines U+202F ne sont pas
  // encodables en WinAnsi et deviennent des artefacts de crénage pdfkit).
  for (const line of lines) {
    if (line.label === "Titre") continue; // déjà dans l'en-tête
    doc
      .font(line.emphasis ? "body-bold" : "body")
      .fontSize(line.emphasis ? 14 : 11)
      .fillColor("#000000")
      .text(`${line.label} : ${line.value}`);
    doc.moveDown(0.35);
  }

  doc.moveDown(1.4);
  doc
    .font("body")
    .fontSize(9)
    .fillColor("#333333")
    .text(
      "Reçu généré depuis la copie figée de la commande — toute valeur enregistrée au moment du paiement fait foi.",
    );

  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

export type ReceiptData =
  | {
      found: true;
      copy: ReceiptCopy;
      lines: ReceiptLine[];
      pdf: Buffer;
    }
  | { found: false };

type OrderRow = {
  reference: string;
  offer_name: string;
  unit_price_da: number;
  discount_da: number;
  total_da: number;
  currency: string;
  status: string;
  customers: { name: string; email: string | null } | null;
};

type ItemRow = { offer_name: string; quantity: number; subtotal_da: number };

type TransitionRow = { created_at: string };

/**
 * Charge la copie figée + génère le PDF. `found: false` = commande inconnue
 * ou PAS confirmée (le reçu n'existe que pour un paiement validé).
 */
export async function generateOrderReceipt(orderId: string): Promise<ReceiptData> {
  const admin = createSupabaseAdminClient();

  const { data: orderRaw, error: orderError } = await admin
    .from("orders")
    .select(
      "reference,offer_name,unit_price_da,discount_da,total_da,currency,status,customers(name,email)",
    )
    .eq("id", orderId)
    .single();
  if (orderError || !orderRaw) return { found: false };
  const order = orderRaw as unknown as OrderRow;

  if (order.currency !== "DA") return { found: false };
  if (order.status !== "paid") return { found: false };

  const { data: itemsRaw, error: itemsError } = await admin
    .from("order_items")
    .select("offer_name,quantity,subtotal_da")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (itemsError) return { found: false };
  const items = ((itemsRaw ?? []) as ItemRow[]).map((r) => ({
    name: r.offer_name,
    quantity: r.quantity,
    subtotalDa: r.subtotal_da,
  }));

  // Date de confirmation : dernière transition confirmed (acteur admin/webhook).
  const { data: transitions } = await admin
    .from("payment_transitions")
    .select("created_at")
    .eq("order_id", orderId)
    .eq("to_status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(1);
  const paidAtIso = ((transitions ?? []) as TransitionRow[])[0]?.created_at;
  if (!paidAtIso) return { found: false };

  const copy: ReceiptCopy = {
    reference: order.reference,
    customerName: order.customers?.name ?? "Client",
    customerEmail: order.customers?.email ?? null,
    offerName: order.offer_name,
    unitPriceDa: order.unit_price_da,
    discountDa: order.discount_da,
    totalDa: order.total_da,
    items: items.length > 0 ? items : [{ name: order.offer_name, quantity: 1, subtotalDa: order.total_da }],
    paidAtIso,
    status: order.status,
  };

  const lines = buildReceiptLines(copy);
  const pdf = await renderPdf(copy, lines);
  return { found: true, copy, lines, pdf };
}
