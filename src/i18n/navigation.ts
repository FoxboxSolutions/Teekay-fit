import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Link/redirect/usePathname/useRouter sensibles à la locale : les href sont
 * écrits sans préfixe (« /coaching ») et reçoivent automatiquement « /fr ».
 */
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
