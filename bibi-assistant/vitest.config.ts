import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [["tests/client/**", "happy-dom"]],
    environment: "node",
    testTimeout: 20_000,
    setupFiles: ["tests/setup.ts"],
  },
});
