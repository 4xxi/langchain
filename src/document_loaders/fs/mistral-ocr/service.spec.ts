import { BatchJobStatus } from "@mistralai/mistralai/models/components";
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
    files: {
      upload: vi.fn().mockResolvedValue({ id: "test-file-id" }),
      download: vi.fn().mockResolvedValue(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  response: { pages: [{ markdown: "test content" }] },
                }) + "\n"
              )
            );
            controller.close();
          },
        })
      ),
    },
    batch: {
      jobs: {
        create: vi.fn().mockResolvedValue({ id: "test-job-id" }),
        get: vi.fn().mockResolvedValue({
          id: "test-job-id",
          status: "success",
          inputFiles: ["test-file-id"],
          endpoint: "ocr",
          model: "test-model",
          outputFile: "test-output-file",
          errors: [],
          createdAt: Date.now(),
          startedAt: Date.now(),
          completedAt: Date.now(),
          totalRequests: 1,
          completedRequests: 1,
          succeededRequests: 1,
          failedRequests: 0,
        }),
      },
    },
  })),
  BatchJobStatus: {
    Queued: "QUEUED",
    Running: "RUNNING",
    Success: "SUCCESS",
    Failed: "FAILED",
    Canceled: "CANCELLED",
    Expired: "TIMEOUT_EXCEEDED",
  },
  FilePurpose: {
    FineTuning: "fine-tuning",
  },
}));

// Mock fs for batch processing
vi.mock("fs", () => ({
  promises: {
    mkdtemp: vi.fn().mockResolvedValue("/tmp/test-dir"),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("test")),
    rm: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
  },
  existsSync: vi.fn().mockReturnValue(true),
}));

describe("MistralOcrService", () => {
  let service: MistralOcrService;
  const mockApiKey = "test-api-key";
  const mockModelName = "test-model";

  beforeEach(() => {
    service = new MistralOcrService({
      apiKey: mockApiKey,
      modelName: mockModelName,
    });
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should throw error if API key is not provided", () => {
      expect(() => new MistralOcrService({ apiKey: "" })).toThrow(
        "Mistral API key is required"
      );
    });

    it("should use default model name if not provided", () => {
      const defaultService = new MistralOcrService({ apiKey: "test-api-key" });
      expect(defaultService["modelName"]).toBe("mistral-ocr-latest");
    });
  });

  describe("processSingle", () => {
    it("should process a single page correctly", async () => {
      // Arrange
      const pageBuffer = Buffer.from("test-buffer");
      const metadata = { source: "test-source" };
      const pageNumber = 3;
      const mockResponse = {
        pages: [
          {
            markdown: "test content for page 3",
            images: [
              {
                id: "img-1.jpeg",
                topLeftX: 294,
                topLeftY: 176,
                bottomRightX: 1390,
                bottomRightY: 561,
                imageBase64: "base64data",
              },
            ],
            dimensions: {
              dpi: 200,
              height: 2200,
              width: 1700,
            },
          },
        ],
      };

      const mockMistralClient = {
        ocr: {
          process: vi.fn().mockResolvedValue(mockResponse),
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      // Act
      const result = await service.processSingle(
        pageBuffer,
        metadata,
        pageNumber
      );

      // Assert
      expect(mockMistralClient.ocr.process).toHaveBeenCalledWith({
        model: mockModelName,
        document: {
          type: "image_url",
          imageUrl: expect.stringContaining("data:image/png;base64,"),
        },
        includeImageBase64: true,
      });

      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("test content for page 3");
      expect(result.metadata).toEqual({
        source: "test-source",
        pdf: {
          loc: { pageNumber: 3 },
        },
        images: [
          {
            id: "img-1.jpeg",
            top_left_x: 294,
            top_left_y: 176,
            bottom_right_x: 1390,
            bottom_right_y: 561,
            image_base64: "base64data",
          },
        ],
        dimensions: {
          dpi: 200,
          height: 2200,
          width: 1700,
        },
      });
    });

    it("should handle errors gracefully", async () => {
      // Arrange
      const pageBuffer = Buffer.from("test-buffer");
      const metadata = { source: "test-source" };
      const pageNumber = 3;

      const mockMistralClient = {
        ocr: {
          process: vi.fn().mockRejectedValue(new Error("API error")),
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      // Act
      const result = await service.processSingle(
        pageBuffer,
        metadata,
        pageNumber
      );

      // Assert
      expect(result).toBeInstanceOf(Document);
      expect(result.pageContent).toBe("");
      expect(result.metadata).toEqual({
        source: "test-source",
        pdf: {
          loc: { pageNumber: 3 },
          error: "API error",
        },
      });
    });
  });

  describe("processBatch", () => {
    const testBuffers = [Buffer.from("test1"), Buffer.from("test2")];
    const testMetadata = { source: "test.pdf" };

    it("should return empty array for empty input", async () => {
      const result = await service.processBatch([], testMetadata);
      expect(result).toEqual([]);
    });

    it("should use single processing for single page", async () => {
      const mockSingle = vi.spyOn(service, "processSingle").mockResolvedValue(
        new Document({
          pageContent: "Single processed content",
          metadata: { ...testMetadata, page: 1 },
        })
      );

      const result = await service.processBatch([testBuffers[0]], testMetadata);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Document);
      expect(result[0].pageContent).toBe("Single processed content");
      expect(mockSingle).toHaveBeenCalledTimes(1);
    }, 10000);

    it("should process multiple pages in batch mode", async () => {
      const mockBatchResponse = [
        {
          response: {
            pages: [
              {
                markdown: "test content for page 1",
                images: [],
                dimensions: null,
              },
            ],
          },
        },
        {
          response: {
            pages: [
              {
                markdown: "test content for page 2",
                images: [],
                dimensions: null,
              },
            ],
          },
        },
      ];

      const mockDownloadStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              mockBatchResponse.map((r) => JSON.stringify(r)).join("\n")
            )
          );
          controller.close();
        },
      });

      const mockMistralClient = {
        files: {
          upload: vi.fn().mockResolvedValue({ id: "test-file-id" }),
          download: vi.fn().mockResolvedValue(mockDownloadStream),
        },
        batch: {
          jobs: {
            create: vi.fn().mockResolvedValue({ id: "test-job-id" }),
            get: vi.fn().mockResolvedValue({
              status: BatchJobStatus.Success,
              failedRequests: 0,
              outputFile: "test-output-file",
            }),
          },
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      const result = await service.processBatch(testBuffers, testMetadata);

      expect(result).toHaveLength(2);
      expect(result[0].pageContent).toBe("test content for page 1");
      expect(result[1].pageContent).toBe("test content for page 2");
    });

    it("should handle batch job failure", async () => {
      const mockSingle = vi
        .spyOn(service, "processSingle")
        .mockRejectedValue(new Error("Processing failed"));

      await expect(
        service.processBatch([Buffer.from("test")], { source: "test.pdf" })
      ).rejects.toThrow("Batch job failed: Processing failed");

      expect(mockSingle).toHaveBeenCalledTimes(1);
    });

    it("should handle batch job timeout", async () => {
      const mockSingle = vi
        .spyOn(service, "processSingle")
        .mockRejectedValue(new Error("Job timed out"));

      await expect(
        service.processBatch([Buffer.from("test")], { source: "test.pdf" })
      ).rejects.toThrow("Batch job failed: Job timed out");

      expect(mockSingle).toHaveBeenCalledTimes(1);
    });

    it("should handle file cleanup errors gracefully", async () => {
      const mockFs = await import("fs");
      const consoleSpy = vi.spyOn(console, "warn");

      // Mock fs.promises.rm to throw an error
      mockFs.promises.rm = vi
        .fn()
        .mockRejectedValue(new Error("Cleanup failed"));
      mockFs.promises.rmdir = vi.fn().mockResolvedValue(undefined);
      mockFs.promises.mkdtemp = vi.fn().mockResolvedValue("/tmp/test-dir");
      mockFs.promises.writeFile = vi.fn().mockResolvedValue(undefined);

      const mockMistralClient = {
        files: {
          upload: vi.fn().mockResolvedValue({ id: "test-file-id" }),
          download: vi.fn().mockResolvedValue(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    JSON.stringify({
                      response: { pages: [{ markdown: "test content" }] },
                    }) + "\n"
                  )
                );
                controller.close();
              },
            })
          ),
        },
        batch: {
          jobs: {
            create: vi.fn().mockResolvedValue({ id: "test-job-id" }),
            get: vi.fn().mockResolvedValue({
              status: BatchJobStatus.Success,
              failedRequests: 0,
              outputFile: "test-output-file",
            }),
          },
        },
      };

      // @ts-expect-error - Accessing private property for testing
      service.mistralClient = mockMistralClient;

      const results = await service.processBatch(
        [Buffer.from("test"), Buffer.from("test2")],
        { source: "test.pdf" }
      );

      expect(results).toBeDefined();
      expect(mockFs.promises.rm).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to cleanup temp files: Cleanup failed"
      );

      consoleSpy.mockRestore();
    });

    it("should handle malformed batch results", async () => {
      const mockSingle = vi
        .spyOn(service, "processSingle")
        .mockRejectedValue(new Error("Malformed response structure"));

      await expect(
        service.processBatch([Buffer.from("test")], { source: "test.pdf" })
      ).rejects.toThrow("Batch job failed: Malformed response structure");

      expect(mockSingle).toHaveBeenCalledTimes(1);
    });
  });
});
