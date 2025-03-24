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

// Mock sharp
vi.mock("sharp", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      jpeg: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from("converted-jpeg")),
    })),
  };
});

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

    it("should handle TIFF (Intel byte order) conversion", async () => {
      // Create a buffer that mimics a TIFF file in Intel byte order (II)
      const tiffBuffer = Buffer.from([
        0x49,
        0x49,
        0x2a,
        0x00,
        ...Array(100).fill(0),
      ]);
      const tiffMetadata = { source: "test.tiff" };

      const mockMistralClient = {
        ocr: {
          process: vi.fn().mockResolvedValue({
            pages: [{ markdown: "tiff content" }],
          }),
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      const result = await service.processImage(tiffBuffer, tiffMetadata);

      // Verify the result
      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("tiff content");

      // Verify sharp was called for conversion
      const sharp = await import("sharp");
      expect(sharp.default).toHaveBeenCalledWith(tiffBuffer);

      // Verify Mistral client was called with jpeg mime type
      expect(mockMistralClient.ocr.process).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            imageUrl: expect.stringContaining("data:image/jpeg;base64,"),
          }),
        })
      );
    });

    it("should handle TIFF (Motorola byte order) conversion", async () => {
      // Create a buffer that mimics a TIFF file in Motorola byte order (MM)
      const tiffBuffer = Buffer.from([
        0x4d,
        0x4d,
        0x00,
        0x2a,
        ...Array(100).fill(0),
      ]);
      const tiffMetadata = { source: "test.tiff" };

      const mockMistralClient = {
        ocr: {
          process: vi.fn().mockResolvedValue({
            pages: [{ markdown: "tiff content" }],
          }),
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      const result = await service.processImage(tiffBuffer, tiffMetadata);

      // Verify the result
      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("tiff content");

      // Verify sharp was called for conversion
      const sharp = await import("sharp");
      expect(sharp.default).toHaveBeenCalledWith(tiffBuffer);

      // Verify Mistral client was called with jpeg mime type
      expect(mockMistralClient.ocr.process).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            imageUrl: expect.stringContaining("data:image/jpeg;base64,"),
          }),
        })
      );
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
