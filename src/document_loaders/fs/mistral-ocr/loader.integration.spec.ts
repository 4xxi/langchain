import * as dotenv from "dotenv";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MistralOcrLoader } from "./loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to verify file existence
const verifyFileExists = (filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Test file not found: ${filePath}`);
  }
  console.log(`Found test file: ${filePath}`);
};

describe("MistralOcrLoader Integration", () => {
  let apiKey: string;
  let tempDir: string;
  let exampleDataDir: string;
  let samplePdfPath: string;
  let largerPdfPath: string;

  beforeAll(() => {
    // Try loading from .env.test.local first
    dotenv.config({ path: ".env.test.local" });

    // Get API key from .env.test.local or environment variable
    apiKey = process.env.MISTRAL_API_KEY as string;

    if (!apiKey) {
      throw new Error(
        "MISTRAL_API_KEY is required. Set it in .env.test.local for local development or as an environment variable for CI"
      );
    }

    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mistral-ocr-test-"));

    // Set up example data directory path
    exampleDataDir = path.resolve(__dirname, "../../../../example_data");
    console.log(`Using example data directory: ${exampleDataDir}`);

    // Set up test file paths
    samplePdfPath = path.resolve(exampleDataDir, "file-sample_150kB.pdf");
    largerPdfPath = path.resolve(exampleDataDir, "nke-10k-2023.pdf");

    // Verify test files exist
    verifyFileExists(samplePdfPath);
    verifyFileExists(largerPdfPath);
  });

  describe("PDF Processing", () => {
    it("should process PDF file with default settings", async () => {
      const loader = new MistralOcrLoader(samplePdfPath, {
        apiKey,
        splitPages: true,
        modelName: "mistral-ocr-latest",
      });

      const docs = await loader.load();
      expect(docs.length).toBeGreaterThan(0);
      console.dir(docs, {
        depth: 5,
      });

      // Verify each document has content and metadata
      docs.forEach((doc, index) => {
        expect(doc.pageContent).toBeTruthy();
        expect(doc.metadata).toBeDefined();
        expect(doc.metadata.pdf).toBeDefined();
        expect(doc.metadata.pdf.loc.pageNumber).toBe(index + 1);
        expect(doc.metadata.pdf.version).toBeDefined();
        expect(doc.metadata.pdf.info).toBeDefined();
        expect(doc.metadata.pdf.totalPages).toBeGreaterThan(0);
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
      expect(docs[0].metadata.pdf.version).toBeDefined();
      expect(docs[0].metadata.pdf.info).toBeDefined();
      expect(docs[0].metadata.pdf.totalPages).toBeGreaterThan(0);
    }, 30000);

    it("should process a larger PDF file", async () => {
      const loader = new MistralOcrLoader(largerPdfPath, {
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
        expect(doc.metadata.pdf.version).toBeDefined();
        expect(doc.metadata.pdf.info).toBeDefined();
        expect(doc.metadata.pdf.totalPages).toBeGreaterThan(0);
      });
    }, 60000);
  });

  describe("Image Processing", () => {
    const imageFormats = [".jpg", ".png", ".webp", ".tiff"];
    let imagePaths: string[];

    beforeAll(() => {
      // Set up and verify all test image paths
      imagePaths = imageFormats.map((format) => {
        const fileName =
          format === ".tiff" ? "file-sample.tiff" : `sample${format}`;
        const imagePath = path.resolve(exampleDataDir, fileName);
        verifyFileExists(imagePath);
        return imagePath;
      });
    });

    imageFormats.forEach((format, index) => {
      it(`should process ${format} image file`, async () => {
        const loader = new MistralOcrLoader(imagePaths[index], {
          apiKey,
          modelName: "mistral-ocr-latest",
        });

        const docs = await loader.load();
        expect(docs).toHaveLength(1);
        expect(docs[0].pageContent).toBeTruthy();
        expect(docs[0].metadata).toBeDefined();
        expect(docs[0].metadata.images).toBeDefined();
        expect(docs[0].metadata.dimensions).toBeDefined();
      }, 30000);
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent file", async () => {
      const loader = new MistralOcrLoader("non-existent.pdf", {
        apiKey,
        modelName: "mistral-ocr-latest",
      });

      await expect(loader.load()).rejects.toThrow(
        "File not found: non-existent.pdf"
      );
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
