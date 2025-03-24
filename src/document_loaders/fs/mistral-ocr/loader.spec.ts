import { Document } from "langchain/document";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
        vi.mocked(MistralOcrService.prototype.processPdf).mockResolvedValue([
          new Document({
            pageContent: "test content",
            metadata: {
              source: "test.pdf",
              pdf: {
                version: "v1.10.100",
                info: {},
                metadata: {},
                totalPages: 1,
                loc: { pageNumber: 1 },
              },
            },
          }),
        ]);
      });

      it("should process PDF and extract metadata", async () => {
        const docs = await loader.parse(mockBuffer, mockMetadata);
        expect(docs).toHaveLength(1);
        expect(docs[0].pageContent).toBe("test content");
        expect(docs[0].metadata).toHaveProperty("pdf");
        expect(docs[0].metadata.pdf).toHaveProperty("version", "v1.10.100");
      });

      it("should handle PDF metadata parsing errors gracefully", async () => {
        const pdfParse = (await import("pdf-parse")).default;
        vi.mocked(pdfParse).mockRejectedValueOnce(
          new Error("PDF parsing failed")
        );

        vi.mocked(MistralOcrService.prototype.processPdf).mockResolvedValueOnce(
          [
            new Document({
              pageContent: "test content",
              metadata: { source: "test.pdf" },
            }),
          ]
        );

        const consoleSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {});
        const docs = await loader.parse(mockBuffer, mockMetadata);

        expect(consoleSpy).toHaveBeenCalledWith(
          "Error parsing PDF metadata:",
          expect.any(Error)
        );
        expect(docs).toHaveLength(1);
        expect(docs[0].metadata).not.toHaveProperty("pdf");

        consoleSpy.mockRestore();
      });

      it("should combine pages when splitPages is false", async () => {
        loader = new MistralOcrLoader("test.pdf", {
          apiKey: mockApiKey,
          splitPages: false,
        });

        vi.mocked(MistralOcrService.prototype.processPdf).mockResolvedValue([
          new Document({
            pageContent: "page 1",
            metadata: {
              source: "test.pdf",
              pdf: {
                version: "v1.10.100",
                info: {},
                metadata: {},
                totalPages: 2,
                loc: { pageNumber: 1 },
              },
            },
          }),
          new Document({
            pageContent: "page 2",
            metadata: {
              source: "test.pdf",
              pdf: {
                version: "v1.10.100",
                info: {},
                metadata: {},
                totalPages: 2,
                loc: { pageNumber: 2 },
              },
            },
          }),
        ]);

        const docs = await loader.parse(mockBuffer, mockMetadata);
        expect(docs).toHaveLength(1);
        expect(docs[0].pageContent).toBe("page 1\n\npage 2");
      });

      it("should handle OCR processing errors", async () => {
        vi.mocked(MistralOcrService.prototype.processPdf).mockRejectedValue(
          new Error("OCR failed")
        );

        await expect(loader.parse(mockBuffer, mockMetadata)).rejects.toThrow(
          "OCR failed"
        );
      });
    });

    describe("Image handling", () => {
      beforeEach(() => {
        loader = new MistralOcrLoader("test.jpg", {
          apiKey: mockApiKey,
        });

        vi.mocked(MistralOcrService.prototype.processImage).mockResolvedValue(
          new Document({
            pageContent: "test content",
            metadata: {
              source: "test.jpg",
              images: [],
              dimensions: null,
            },
          })
        );
      });

      it("should process image files directly", async () => {
        const docs = await loader.parse(mockBuffer, { source: "test.jpg" });
        expect(docs).toHaveLength(1);
        expect(MistralOcrService.prototype.processImage).toHaveBeenCalledWith(
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
