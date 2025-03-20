import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
      reporter: ["text", "json", "html"],
    },
  },
});
