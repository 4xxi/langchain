import * as dotenv from "dotenv";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MistralOcrLoader } from "./loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("MistralOcrLoader Integration", () => {
  let apiKey: string;
  let tempDir: string;

  beforeAll(() => {
    // Load test environment variables
    dotenv.config({ path: ".env.test.local" });
    apiKey = process.env.MISTRAL_API_KEY!;

    if (!apiKey) {
      throw new Error(
        "MISTRAL_API_KEY environment variable is required in .env.test.local"
      );
    }

    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mistral-ocr-test-"));
  });

  describe("PDF Processing", () => {
    const samplePdfPath = path.join(
      __dirname,
      "../../../../example_data/file-sample_150kB.pdf"
    );

    it("should process PDF file with default settings", async () => {
      const loader = new MistralOcrLoader(samplePdfPath, {
        apiKey,
        splitPages: true,
        modelName: "mistral-ocr-latest",
      });

      const docs = await loader.load();
      expect(docs.length).toBeGreaterThan(0);

      // Verify each document has content and metadata
      docs.forEach((doc, index) => {
        expect(doc.pageContent).toBeTruthy();
        expect(doc.metadata).toBeDefined();
        expect(doc.metadata.pdf).toBeDefined();
        expect(doc.metadata.pdf.loc.pageNumber).toBe(index + 1);
      });
    });

    it("should process PDF file with forced image conversion", async () => {
      const loader = new MistralOcrLoader(samplePdfPath, {
        apiKey,
        splitPages: true,
        forceImageConversion: true,
        pdfImageFormat: "png",
        pdfImageQuality: 100,
        modelName: "mistral-ocr-latest",
      });

      const docs = await loader.load();
      expect(docs.length).toBeGreaterThan(0);

      // Verify each document has content and metadata
      docs.forEach((doc, index) => {
        expect(doc.pageContent).toBeTruthy();
        expect(doc.metadata).toBeDefined();
        expect(doc.metadata.pdf).toBeDefined();
        expect(doc.metadata.pdf.loc.pageNumber).toBe(index + 1);
      });
    }, 30000);

    it("should combine all pages when splitPages is false", async () => {
      const loader = new MistralOcrLoader(samplePdfPath, {
        apiKey,
        splitPages: false,
        modelName: "mistral-ocr-latest",
      });

      const docs = await loader.load();
      expect(docs).toHaveLength(1);
      expect(docs[0].pageContent).toBeTruthy();
      expect(docs[0].metadata.pdf).toBeDefined();
    });
  });

  describe("Image Processing", () => {
    const imageFormats = [".jpg", ".png", ".webp"];

    imageFormats.forEach((format) => {
      const sampleImagePath = path.join(
        __dirname,
        `../../../../example_data/sample${format}`
      );

      it(`should process ${format} image file`, async () => {
        const loader = new MistralOcrLoader(sampleImagePath, {
          apiKey,
          modelName: "mistral-ocr-latest",
        });

        const docs = await loader.load();
        expect(docs).toHaveLength(1);
        expect(docs[0].pageContent).toBeTruthy();
        expect(docs[0].metadata).toBeDefined();
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent file", async () => {
      const loader = new MistralOcrLoader("non-existent.pdf", {
        apiKey,
        modelName: "mistral-ocr-latest",
      });

      await expect(loader.load()).rejects.toThrow();
    });

    it("should handle unsupported file type", async () => {
      // Create a temporary file with unsupported extension
      const unsupportedFile = path.join(tempDir, "test.xyz");
      fs.writeFileSync(unsupportedFile, "test content");

      const loader = new MistralOcrLoader(unsupportedFile, {
        apiKey,
        modelName: "mistral-ocr-latest",
      });

      await expect(loader.load()).rejects.toThrow("Unsupported file type");

      // Clean up
      fs.unlinkSync(unsupportedFile);
    });

    it("should handle invalid API key", async () => {
      const loader = new MistralOcrLoader("test.pdf", {
        apiKey: "invalid-key",
        modelName: "mistral-ocr-latest",
      });

      await expect(loader.load()).rejects.toThrow();
    });
  });

  // Clean up temp directory after all tests
  afterAll(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
