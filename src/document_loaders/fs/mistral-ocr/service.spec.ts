import { Document } from "langchain/document";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MistralOcrService } from "./service";

// Mock external dependencies
vi.mock("@mistralai/mistralai", () => ({
  Mistral: vi.fn().mockImplementation(() => ({
    ocr: {
      process: vi.fn().mockResolvedValue({
        pages: [{ markdown: "test content" }],
      }),
    },
  })),
}));

describe("MistralOcrService", () => {
  let service: MistralOcrService;

  beforeEach(() => {
    service = new MistralOcrService({
      apiKey: "test-key",
      modelName: "test-model",
    });
  });

  describe("processImage", () => {
    const testBuffer = Buffer.from("test");
    const testMetadata = { source: "test.jpg" };

    it("should process an image successfully", async () => {
      const result = await service.processImage(testBuffer, testMetadata);

      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("test content");
      expect(result.metadata).toEqual({
        source: "test.jpg",
        images: [],
        dimensions: null,
      });
    });

    it("should handle OCR processing errors", async () => {
      const mockMistralClient = {
        ocr: {
          process: vi.fn().mockRejectedValue(new Error("OCR failed")),
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      await expect(
        service.processImage(testBuffer, testMetadata)
      ).rejects.toThrow("OCR processing failed: OCR failed");
    });

    it("should handle malformed response structure", async () => {
      const mockMistralClient = {
        ocr: {
          process: vi.fn().mockResolvedValue({}),
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      await expect(
        service.processImage(testBuffer, testMetadata)
      ).rejects.toThrow("Malformed response structure");
    });
  });

  describe("processPdf", () => {
    const testBuffer = Buffer.from("test");
    const testMetadata = { source: "test.pdf" };

    it("should process a PDF successfully", async () => {
      const mockMistralClient = {
        ocr: {
          process: vi.fn().mockResolvedValue({
            pages: [{ markdown: "page 1" }, { markdown: "page 2" }],
          }),
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      const results = await service.processPdf(testBuffer, testMetadata);

      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(Document);
      expect(results[0].pageContent).toBe("page 1");
      expect(results[0].metadata).toEqual({
        source: "test.pdf",
        pdf: {
          loc: { pageNumber: 1 },
        },
        images: [],
        dimensions: null,
      });
    });

    it("should handle OCR processing errors", async () => {
      const mockMistralClient = {
        ocr: {
          process: vi.fn().mockRejectedValue(new Error("OCR failed")),
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      await expect(
        service.processPdf(testBuffer, testMetadata)
      ).rejects.toThrow("OCR processing failed: OCR failed");
    });

    it("should handle malformed response structure", async () => {
      const mockMistralClient = {
        ocr: {
          process: vi.fn().mockResolvedValue({}),
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      await expect(
        service.processPdf(testBuffer, testMetadata)
      ).rejects.toThrow("Malformed response structure");
    });
  });
});
