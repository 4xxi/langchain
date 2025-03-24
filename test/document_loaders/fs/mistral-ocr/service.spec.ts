import { Document } from "langchain/document";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MistralOcrService } from "../../../../src/document_loaders/fs/mistral-ocr/service.js";

// Mock the Mistral client
vi.mock("@mistralai/mistralai", () => {
  return {
    Mistral: vi.fn().mockImplementation(() => ({
      ocr: {
        process: vi.fn(),
      },
    })),
  };
});

describe("MistralOcrService", () => {
  let service: MistralOcrService;
  let mockResponse: any;

  beforeEach(() => {
    // Create a new service instance for each test
    service = new MistralOcrService({ apiKey: "test-api-key" });

    // Reset mock response
    mockResponse = {
      pages: [
        {
          markdown: "Test content",
          images: [
            {
              id: "img1",
              topLeftX: 10,
              topLeftY: 20,
              bottomRightX: 100,
              bottomRightY: 200,
              imageBase64: "base64data",
            },
          ],
          dimensions: { width: 800, height: 600 },
        },
      ],
    };

    // Setup mock implementation
    (service as any).mistralClient.ocr.process.mockResolvedValue(mockResponse);
  });

  describe("processImage", () => {
    it("should process PNG image correctly", async () => {
      // Create a mock PNG buffer (just the header is needed for mime detection)
      const buffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const metadata = { source: "test.png" };

      const result = await service.processImage(buffer, metadata);

      // Check that the OCR API was called with correct parameters
      expect((service as any).mistralClient.ocr.process).toHaveBeenCalledWith({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          imageUrl: expect.stringContaining("data:image/png;base64,"),
        },
        includeImageBase64: true,
      });

      // Check the result
      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("Test content");
      expect(result.metadata).toMatchObject({
        source: "test.png",
        images: [
          {
            id: "img1",
            top_left_x: 10,
            top_left_y: 20,
            bottom_right_x: 100,
            bottom_right_y: 200,
            image_base64: "base64data",
          },
        ],
        dimensions: { width: 800, height: 600 },
      });
    });

    it("should process JPEG image correctly", async () => {
      // Create a mock JPEG buffer (just the header is needed for mime detection)
      const buffer = Buffer.from([0xff, 0xd8, 0xff]);
      const metadata = { source: "test.jpg" };

      const result = await service.processImage(buffer, metadata);

      // Check that the OCR API was called with correct parameters
      expect((service as any).mistralClient.ocr.process).toHaveBeenCalledWith({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          imageUrl: expect.stringContaining("data:image/jpeg;base64,"),
        },
        includeImageBase64: true,
      });

      // Check the result
      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("Test content");
    });

    it("should process WebP image correctly", async () => {
      // Create a mock WebP buffer (just the header is needed for mime detection)
      const buffer = Buffer.from([0x52, 0x49, 0x46, 0x46]);
      const metadata = { source: "test.webp" };

      const result = await service.processImage(buffer, metadata);

      // Check that the OCR API was called with correct parameters
      expect((service as any).mistralClient.ocr.process).toHaveBeenCalledWith({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          imageUrl: expect.stringContaining("data:image/webp;base64,"),
        },
        includeImageBase64: true,
      });

      // Check the result
      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("Test content");
    });

    it("should process TIFF image correctly (Intel byte order)", async () => {
      // Create a mock TIFF buffer with Intel byte order (II)
      const buffer = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
      const metadata = { source: "test.tiff" };

      const result = await service.processImage(buffer, metadata);

      // Check that the OCR API was called with correct parameters
      expect((service as any).mistralClient.ocr.process).toHaveBeenCalledWith({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          imageUrl: expect.stringContaining("data:image/tiff;base64,"),
        },
        includeImageBase64: true,
      });

      // Check the result
      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("Test content");
    });

    it("should process TIFF image correctly (Motorola byte order)", async () => {
      // Create a mock TIFF buffer with Motorola byte order (MM)
      const buffer = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
      const metadata = { source: "test.tiff" };

      const result = await service.processImage(buffer, metadata);

      // Check that the OCR API was called with correct parameters
      expect((service as any).mistralClient.ocr.process).toHaveBeenCalledWith({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          imageUrl: expect.stringContaining("data:image/tiff;base64,"),
        },
        includeImageBase64: true,
      });

      // Check the result
      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("Test content");
    });

    it("should handle API errors gracefully", async () => {
      // Setup mock to throw an error
      (service as any).mistralClient.ocr.process.mockRejectedValue(
        new Error("API error")
      );

      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const metadata = { source: "test.png" };

      // Expect the error to be caught and re-thrown with a custom message
      await expect(service.processImage(buffer, metadata)).rejects.toThrow(
        "OCR processing failed: API error"
      );
    });

    it("should handle malformed response structure", async () => {
      // Setup a malformed response (no pages array)
      (service as any).mistralClient.ocr.process.mockResolvedValue({});

      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const metadata = { source: "test.png" };

      // Expect the error about malformed response
      await expect(service.processImage(buffer, metadata)).rejects.toThrow(
        "OCR processing failed: Malformed response structure"
      );
    });
  });

  describe("processPdf", () => {
    it("should process PDF correctly", async () => {
      // Multi-page response
      const multiPageResponse = {
        pages: [
          {
            markdown: "Page 1 content",
            images: [
              {
                id: "img1",
                topLeftX: 10,
                topLeftY: 20,
                bottomRightX: 100,
                bottomRightY: 200,
              },
            ],
            dimensions: { width: 800, height: 600 },
          },
          {
            markdown: "Page 2 content",
            images: [
              {
                id: "img2",
                topLeftX: 30,
                topLeftY: 40,
                bottomRightX: 300,
                bottomRightY: 400,
              },
            ],
            dimensions: { width: 800, height: 600 },
          },
        ],
      };

      // Setup the mock for this test
      (service as any).mistralClient.ocr.process.mockResolvedValue(
        multiPageResponse
      );

      const buffer = Buffer.from("mock PDF data");
      const metadata = { source: "test.pdf", pdf: {} };

      const results = await service.processPdf(buffer, metadata);

      // Check that the OCR API was called with correct parameters
      expect((service as any).mistralClient.ocr.process).toHaveBeenCalledWith({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: expect.stringContaining("data:application/pdf;base64,"),
        },
        includeImageBase64: true,
      });

      // Check the results
      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(Document);
      expect(results[0].pageContent).toBe("Page 1 content");
      expect(results[0].metadata).toMatchObject({
        source: "test.pdf",
        pdf: { loc: { pageNumber: 1 } },
      });

      expect(results[1]).toBeInstanceOf(Document);
      expect(results[1].pageContent).toBe("Page 2 content");
      expect(results[1].metadata).toMatchObject({
        source: "test.pdf",
        pdf: { loc: { pageNumber: 2 } },
      });
    });

    it("should handle API errors gracefully for PDF processing", async () => {
      // Setup mock to throw an error
      (service as any).mistralClient.ocr.process.mockRejectedValue(
        new Error("PDF API error")
      );

      const buffer = Buffer.from("mock PDF data");
      const metadata = { source: "test.pdf", pdf: {} };

      // Expect the error to be caught and re-thrown with a custom message
      await expect(service.processPdf(buffer, metadata)).rejects.toThrow(
        "OCR processing failed: PDF API error"
      );
    });

    it("should handle malformed response structure for PDF processing", async () => {
      // Setup a malformed response (no pages array)
      (service as any).mistralClient.ocr.process.mockResolvedValue({});

      const buffer = Buffer.from("mock PDF data");
      const metadata = { source: "test.pdf", pdf: {} };

      // Expect the error about malformed response
      await expect(service.processPdf(buffer, metadata)).rejects.toThrow(
        "OCR processing failed: Malformed response structure"
      );
    });
  });
});
