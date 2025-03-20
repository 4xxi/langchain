import { Document } from "langchain/document";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as pdfToImage from "../../../pdf-utils/pdf-to-image";
import { MistralOcrLoader } from "./loader";
import { MistralOcrService } from "./service";

// Mock dependencies
vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({
    numpages: 1,
    numrender: 1,
    version: "v1.10.100",
    info: {},
    metadata: {},
    text: "test content",
  }),
}));
vi.mock("../../../pdf-utils/pdf-to-image");
vi.mock("./service");

describe("MistralOcrLoader", () => {
  let loader: MistralOcrLoader;
  const mockApiKey = "test-api-key";
  const mockBuffer = Buffer.from("test");

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new MistralOcrLoader("test.pdf", {
      apiKey: mockApiKey,
    });
  });

  describe("constructor", () => {
    it("should initialize with default values", () => {
      expect(loader).toBeInstanceOf(MistralOcrLoader);
    });

    it("should throw error if API key is missing", () => {
      expect(() => new MistralOcrLoader("test.pdf", {} as any)).toThrow(
        "Mistral API key is required"
      );
    });
  });

  describe("parse", () => {
    const mockMetadata = { source: "test.pdf" };

    it("should throw error if file path is missing in metadata", async () => {
      await expect(loader.parse(mockBuffer, {})).rejects.toThrow(
        "File path is required in metadata.source"
      );
    });

    it("should throw error for unsupported file type", async () => {
      await expect(
        loader.parse(mockBuffer, { source: "test.xyz" })
      ).rejects.toThrow("Unsupported file type");
    });

    describe("PDF handling", () => {
      beforeEach(() => {
        vi.mocked(pdfToImage.convertPdfToImage).mockResolvedValue(
          Buffer.from("image")
        );

        vi.mocked(MistralOcrService.prototype.processSingle).mockResolvedValue(
          new Document({
            pageContent: "test content",
            metadata: {},
          })
        );
      });

      it("should process PDF directly when forceImageConversion is false", async () => {
        const docs = await loader.parse(mockBuffer, mockMetadata);
        expect(docs).toHaveLength(1);
        expect(docs[0].pageContent).toBe("test content");
        expect(pdfToImage.convertPdfToImage).not.toHaveBeenCalled();
      });

      it("should convert PDF to images when forceImageConversion is true", async () => {
        loader = new MistralOcrLoader("test.pdf", {
          apiKey: mockApiKey,
          forceImageConversion: true,
        });

        const docs = await loader.parse(mockBuffer, mockMetadata);
        expect(docs).toHaveLength(1);
        expect(pdfToImage.convertPdfToImage).toHaveBeenCalled();
      });

      it("should handle PDF conversion errors", async () => {
        vi.mocked(pdfToImage.convertPdfToImage).mockRejectedValue(
          new Error("conversion error")
        );

        // Mock service to throw error
        vi.mocked(MistralOcrService.prototype.processSingle).mockRejectedValue(
          new Error("OCR failed")
        );

        loader = new MistralOcrLoader("test.pdf", {
          apiKey: mockApiKey,
          forceImageConversion: true,
        });

        const docs = await loader.parse(mockBuffer, mockMetadata);
        expect(docs).toHaveLength(1);
        expect(docs[0].pageContent).toBe("");
        expect(docs[0].metadata.pdf.error).toBe("conversion error");
      });
    });

    describe("Image handling", () => {
      beforeEach(() => {
        loader = new MistralOcrLoader("test.jpg", {
          apiKey: mockApiKey,
        });

        // Reset and setup mock for image processing
        vi.mocked(MistralOcrService.prototype.processSingle).mockResolvedValue(
          new Document({
            pageContent: "test content",
            metadata: {},
          })
        );
      });

      it("should process image files directly", async () => {
        const docs = await loader.parse(mockBuffer, { source: "test.jpg" });
        expect(docs).toHaveLength(1);
        expect(MistralOcrService.prototype.processSingle).toHaveBeenCalledWith(
          mockBuffer,
          { source: "test.jpg" }
        );
      });

      it("should support various image formats", async () => {
        const imageFormats = [
          ".jpg",
          ".jpeg",
          ".png",
          ".webp",
          ".tiff",
          ".bmp",
          ".gif",
        ];

        for (const format of imageFormats) {
          loader = new MistralOcrLoader(`test${format}`, {
            apiKey: mockApiKey,
          });
          const docs = await loader.parse(mockBuffer, {
            source: `test${format}`,
          });
          expect(docs).toHaveLength(1);
        }
      });
    });
  });
});
