import { execSync } from "child_process";
import * as esbuild from "esbuild";

const sharedConfig = {
  entryPoints: ["src/index.ts", "src/document_loaders/fs/mistral-ocr/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  minify: true,
  sourcemap: true,
  packages: "external", // This is more efficient than listing each package
  logLevel: "info",
  resolveExtensions: [".ts", ".js", ".mjs", ".json"],
  mainFields: ["module", "main"],
  format: "esm",
  pure: [
    "console.log",
    "console.error",
    "console.warn",
    "console.debug",
    "console.info",
  ],
};

try {
  // Build ESM
  await esbuild.build({
    ...sharedConfig,
    format: "esm",
    outExtension: { ".js": ".js" },
    outdir: "dist",
  });

  // Build CJS
  await esbuild.build({
    ...sharedConfig,
    format: "cjs",
    outExtension: { ".js": ".cjs" },
    outdir: "dist",
  });

  // Generate TypeScript declaration files
  console.log("Generating TypeScript declaration files...");
  execSync("tsc --emitDeclarationOnly --declaration --project tsconfig.json", {
    stdio: "inherit",
  });

  console.log("Build completed successfully!");
} catch (error) {
  console.error("Build failed:", error);
  process.exit(1);
}
