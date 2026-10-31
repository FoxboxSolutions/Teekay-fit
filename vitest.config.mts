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
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
