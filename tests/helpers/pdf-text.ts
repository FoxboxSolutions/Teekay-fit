import { inflateSync } from "node:zlib";

/**
 * Extraction de texte des PDF GÉNÉRÉS PAR LES TESTS uniquement (aucune
 * dépendance) : décompression de tous les flux (FlateDecode si présent),
 * puis lecture des opérateurs de texte (Tj / TJ, chaînes littérales ou
 * hexadécimales WinAnsi). Suffisant pour compter les occurrences du
 * filigrane sur les PDF fictifs de tests — pas un parseur PDF complet.
 */
export function extractPdfText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf);
  const out: string[] = [];

  let idx = 0;
  while (true) {
    const streamStart = raw.indexOf("stream", idx);
    if (streamStart === -1) break;
    const dataStart = streamStart + 6;
    // « stream\r\n » ou « stream\n »
    const skip = raw[dataStart] === 0x0d ? 2 : 1;
    const dataBegin = dataStart + skip;
    const end = raw.indexOf("endstream", dataBegin);
    if (end === -1) break;
    const chunk = raw.subarray(dataBegin, end);

    // Décompression si le flux est FlateDecode (sinon flux brut).
    let content: string;
    try {
      content = inflateSync(chunk).toString("latin1");
    } catch {
      content = chunk.toString("latin1");
    }
    out.push(decodeTextOperators(content));
    idx = end + 9;
  }
  return out.join("\n");
}

/** Décode les opérateurs de texte d'un contenu de page. */
function decodeTextOperators(content: string): string {
  const parts: string[] = [];

  // Chaînes littérales : (...) Tj — escapes PDF de base.
  const literal = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  for (const m of content.matchAll(literal)) {
    parts.push(
      (m[1] as string)
        .replace(/\\([nrtbf()\\])/g, (_, c: string) =>
          c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c,
        )
        .replace(/\\(\d{1,3})/g, (_, oct: string) =>
          String.fromCharCode(parseInt(oct, 8)),
        ),
    );
  }

  // Chaînes hexadécimales : <...> Tj (WinAnsi, 2 chiffres par octet).
  const hex = /<([0-9A-Fa-f]+)>\s*Tj/g;
  for (const m of content.matchAll(hex)) {
    const h = m[1] as string;
    let s = "";
    for (let i = 0; i + 1 < h.length; i += 2) {
      s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
    }
    parts.push(s);
  }

  // Tableaux TJ : fragments littéraux ou hex.
  const array = /\[(.*?)\]\s*TJ/gs;
  for (const m of content.matchAll(array)) {
    const inner = m[1] as string;
    for (const f of inner.matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
      parts.push(f[1] as string);
    }
    for (const f of inner.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const h = f[1] as string;
      let s = "";
      for (let i = 0; i + 1 < h.length; i += 2) {
        s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
      }
      parts.push(s);
    }
  }

  return parts.join("\n");
}
