import "server-only";

type LogLevel = "info" | "warn" | "error";

type LogEvent = {
  level: LogLevel;
  event: string;
  [key: string]: unknown;
};

const SENSITIVE_KEYS = /(secret|token|password|key|authorization|cookie|pin|otp)/i;

/** Masque les valeurs sensibles : jamais de secret dans les journaux (PRD §15). */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.test(key) ? "[redacted]" : redact(val, depth + 1);
  }
  return out;
}

/** Journal structuré JSON — un objet par ligne. */
export function logEvent(entry: LogEvent): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...(redact(entry) as Record<string, unknown>),
  });

  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.log(line);
}
