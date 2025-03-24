import { Document } from "langchain/document";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MistralOcrService } from "./service";

// Mock implementation for the Mistral OCR process API
const mockOcrProcess = vi.fn().mockResolvedValue({
  pages: [{ markdown: "test content" }],
});

// Mock the Mistral client
vi.mock("@mistralai/mistralai", () => ({
  Mistral: vi.fn().mockImplementation(() => ({
    ocr: {
      process: mockOcrProcess,
    },
  })),
}));

// Mock sharp
vi.mock("sharp", () => ({
  default: vi.fn().mockImplementation(() => ({
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("converted-jpeg")),
  })),
}));

describe("MistralOcrService", () => {
  let service: MistralOcrService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a fresh instance of the service
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

    it("should detect and convert TIFF (Intel byte order)", async () => {
      // Create a buffer that mimics TIFF in Intel byte order (II)
      const tiffBuffer = Buffer.from([
        0x49,
        0x49,
        0x2a,
        0x00,
        ...Array(100).fill(0),
      ]);
      const tiffMetadata = { source: "test.tiff" };

      await service.processImage(tiffBuffer, tiffMetadata);

      // Check that the Mistral API was called with a JPEG mime type
      expect(mockOcrProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            imageUrl: expect.stringContaining("data:image/jpeg;base64,"),
          }),
        })
      );
    });

    it("should detect and convert TIFF (Motorola byte order)", async () => {
      // Create a buffer that mimics TIFF in Motorola byte order (MM)
      const tiffBuffer = Buffer.from([
        0x4d,
        0x4d,
        0x00,
        0x2a,
        ...Array(100).fill(0),
      ]);
      const tiffMetadata = { source: "test.tiff" };

      await service.processImage(tiffBuffer, tiffMetadata);

      // Check that the Mistral API was called with a JPEG mime type
      expect(mockOcrProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            imageUrl: expect.stringContaining("data:image/jpeg;base64,"),
          }),
        })
      );
    });

    it("should handle OCR processing errors", async () => {
      mockOcrProcess.mockRejectedValueOnce(new Error("OCR failed"));

      await expect(
        service.processImage(testBuffer, testMetadata)
      ).rejects.toThrow("OCR processing failed: OCR failed");
    });

    it("should handle malformed response structure", async () => {
      mockOcrProcess.mockResolvedValueOnce({});

      await expect(
        service.processImage(testBuffer, testMetadata)
      ).rejects.toThrow("Malformed response structure");
    });
  });

  describe("processPdf", () => {
    const testBuffer = Buffer.from("test");
    const testMetadata = { source: "test.pdf" };

    it("should process a PDF successfully", async () => {
      mockOcrProcess.mockResolvedValueOnce({
        pages: [{ markdown: "page 1" }, { markdown: "page 2" }],
      });

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
      mockOcrProcess.mockRejectedValueOnce(new Error("OCR failed"));

      await expect(
        service.processPdf(testBuffer, testMetadata)
      ).rejects.toThrow("OCR processing failed: OCR failed");
    });

    it("should handle malformed response structure", async () => {
      mockOcrProcess.mockResolvedValueOnce({});

      await expect(
        service.processPdf(testBuffer, testMetadata)
      ).rejects.toThrow("Malformed response structure");
    });
  });
});
