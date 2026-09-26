import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: true,
    minify: "esbuild",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "apex-modules"
    },
    rollupOptions: {
      external: [],
      output: {
        manualChunks: {
          "ai-safety": [
            "src/modules/ai-safety/jailbreak.ts",
            "src/modules/ai-safety/persona.ts",
            "src/modules/ai-safety/hallucination.ts"
          ],
          "compliance": [
            "src/modules/compliance/age.ts",
            "src/modules/compliance/apdp.ts",
            "src/modules/compliance/consent.ts"
          ],
          "code-companion": [
            "src/modules/code/github.ts",
            "src/modules/code/dependency-graph.ts"
          ]
        }
      }
    }
  },
  test: {
    globals: true,
    environment: "happy-dom",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"]
    }
  }
});
