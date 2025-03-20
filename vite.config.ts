import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: [
      "**/*.integration.spec.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.{idea,git,cache,output,temp}/**",
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/*.integration.spec.ts",
      ],
      reporter: ["text", "json", "html"],
    },
  },
});
