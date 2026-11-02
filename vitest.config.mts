import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: {
      // Les modules « server-only » (routes, lib serveur) sont testables :
      // le guard npm ne s'applique qu'aux Client Components React.
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only-stub.ts"),
      // next-intl importe « next/server » sans suffixe ; Node ESM exige le
      // fichier explicite ici (résolution interne de vitest).
      "next/server": path.resolve(import.meta.dirname, "node_modules/next/server.js"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
