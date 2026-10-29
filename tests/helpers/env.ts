import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

export type LocalEnv = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

/**
 * Clés du stack Supabase local : variables d'env fournies, sinon lecture via
 * `supabase status -o env` (exige Docker + `npx supabase start`).
 */
export function getLocalEnv(): LocalEnv {
  const fromProcess = {
    apiUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (fromProcess.apiUrl && fromProcess.anonKey && fromProcess.serviceRoleKey) {
    return fromProcess as LocalEnv;
  }

  const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const output = execFileSync("npx supabase status -o env", {
    cwd: root,
    encoding: "utf8",
    shell: true,
    env: { ...process.env, PATH: `${process.env.PATH};C:\\Program Files\\Docker\\Docker\\resources\\bin` },
    timeout: 60_000,
  });

  const read = (key: string): string => {
    const match = output.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"));
    if (!match || !match[1]) throw new Error(`clé absente du statut supabase: ${key}`);
    return match[1];
  };

  return {
    apiUrl: read("API_URL"),
    anonKey: read("ANON_KEY"),
    serviceRoleKey: read("SERVICE_ROLE_KEY"),
  };
}
