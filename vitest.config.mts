import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Loads DATABASE_URL for the database-backed isolation tests. The pure
    // logic tests do not need it and run either way.
    setupFiles: ["dotenv/config"],
    include: ["src/**/*.test.ts"],
    // The isolation suite creates and drops real rows, so files must not run
    // against the same database concurrently.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a React Server Component
      // bundler. It is a build-time guard, not runtime behaviour, so it is
      // stubbed out here rather than removed from the modules it protects.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
});
