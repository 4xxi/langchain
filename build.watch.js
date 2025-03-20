import * as esbuild from "esbuild";

const sharedConfig = {
  entryPoints: ["src/index.ts", "src/document_loaders/fs/mistral-ocr/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  sourcemap: true,
  packages: "external",
  logLevel: "info",
  watch: {
    onRebuild(error, result) {
      if (error) console.error("watch build failed:", error);
      else console.log("watch build succeeded:", result);
    },
  },
};

try {
  // Build ESM
  const esmContext = await esbuild.context({
    ...sharedConfig,
    format: "esm",
    outdir: "dist",
  });

  // Build CJS
  const cjsContext = await esbuild.context({
    ...sharedConfig,
    format: "cjs",
    outExtension: { ".js": ".cjs" },
    outdir: "dist",
  });

  await Promise.all([esmContext.watch(), cjsContext.watch()]);

  console.log("Watching for changes...");
} catch (error) {
  console.error("Watch setup failed:", error);
  process.exit(1);
}
