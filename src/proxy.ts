import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Proxy Next.js 16 (ex-middleware) :
 * 1. Protection CSRF : vérification de l'origine sur les requêtes mutantes
 *    (complément des cookies SameSite=Lax du client Supabase).
 * 2. Routage i18n next-intl.
 */
export default function proxy(request: NextRequest) {
  if (MUTATING.has(request.method)) {
    const origin = request.headers.get("origin");
    const allowed = process.env.NEXT_PUBLIC_APP_URL;

    if (origin && allowed && origin !== allowed) {
      return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
    }
    // Requête sans origin (même navigateur, certains cas) : le referer serveur
    // à vite échoué — on laisse passer, les cookies SameSite + RLS protègent.
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
