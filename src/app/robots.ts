import type { MetadataRoute } from "next";
import { isIndexable } from "@/lib/env";

/**
 * robots.txt (audit M4 / décision APP_ENV) :
 *  - production explicite → Allow + sitemap (seule valeur indexable) ;
 *  - tout autre état (development, preview, absente, invalide) → Disallow /.
 */
export default function robots(): MetadataRoute.Robots {
  if (isIndexable()) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return {
      rules: [{ userAgent: "*", allow: "/" }],
      sitemap: `${base}/sitemap.xml`,
    };
  }
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
