import * as esbuild from "esbuild";
import { glob } from "glob";
import path from "path";

const exampleFiles = glob.sync("examples/*.ts");

try {
  // Build examples
  await esbuild.build({
    entryPoints: exampleFiles,
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outdir: "examples/dist",
    outExtension: { ".js": ".js" },
    sourcemap: true,
    packages: "external",
    logLevel: "info",
    resolveExtensions: [".ts", ".js", ".mjs", ".json"],
    alias: {
      // Map the package name to the local path
      "@4xxi/langchain/document_loaders/fs/mistral-ocr": path.resolve("dist/document_loaders/fs/mistral-ocr/index.js")
    }
  });

  console.log("Examples build completed successfully!");
} catch (error) {
  console.error("Examples build failed:", error);
  process.exit(1);
} 