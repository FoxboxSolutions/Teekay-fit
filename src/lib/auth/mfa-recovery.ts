import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Génération et validation des codes de secours MFA admin.
 * Stockage : SHA-256 (les codes ont une entropie suffisante pour un hash
 * rapide) — le code en clair n'est affiché qu'une seule fois à l'activation.
 */
import { createHash, randomInt, timingSafeEqual } from "crypto";

const CODE_LENGTH = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans O/0/I/1 ambiguës
const CODES_PER_USER = 8;

function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
    if (i === 4) out += "-";
  }
  return out;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}

/** Génère les codes, les stocke hashés, renvoie les codes en clair (une seule fois). */
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
  const supabase = createSupabaseAdminClient();
  const codes = Array.from({ length: CODES_PER_USER }, generateCode);

  const rows = codes.map((code) => ({
    user_id: userId,
    code_hash: hashRecoveryCode(code),
  }));

  const { error } = await supabase.from("mfa_recovery_codes").insert(rows);
  if (error) throw new Error(`insertion codes de secours échouée: ${error.message}`);

  return codes;
}

/**
 * Valide un code (comparaison à temps constant) et le marque utilisé.
 * Appelé uniquement pour débloquer un admin dont le téléphone est perdu.
 */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const hash = hashRecoveryCode(code);

  const { data: rows, error } = await supabase
    .from("mfa_recovery_codes")
    .select("id, code_hash")
    .eq("user_id", userId)
    .is("used_at", null)
    .limit(20);

  if (error || !rows || rows.length === 0) return false;

  const match = rows.find((row) => {
    const a = Buffer.from(row.code_hash, "hex");
    const b = Buffer.from(hash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!match) return false;

  const { error: usedError } = await supabase
    .from("mfa_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", match.id);

  if (usedError) throw new Error(`marquage code utilisé échoué: ${usedError.message}`);
  return true;
}
