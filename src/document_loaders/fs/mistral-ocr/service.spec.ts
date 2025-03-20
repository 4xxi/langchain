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
    Queued: "queued",
    Running: "running",
    Success: "success",
    Failed: "failed",
    Canceled: "canceled",
    Expired: "expired",
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
    });

    it("should process multiple pages in batch mode", async () => {
      // Setup spies to track calls to Mistral API
      const { Mistral } = await import("@mistralai/mistralai");
      const mistralInstance = new Mistral({ apiKey: "test-key" });

      // @ts-expect-error - Replace service's mistralClient with our mock
      service.mistralClient = mistralInstance;

      // Mock the batch job to show success
      vi.spyOn(mistralInstance.batch.jobs, "get").mockResolvedValue({
        id: "test-job-id",
        status: BatchJobStatus.Success,
        outputFile: "test-output-file",
      } as any);

      // Mock the file download to return properly formatted data
      const mockResults =
        [
          { response: { pages: [{ markdown: "result1" }] } },
          { response: { pages: [{ markdown: "result2" }] } },
        ]
          .map((r) => JSON.stringify(r))
          .join("\n") + "\n";

      vi.spyOn(mistralInstance.files, "download").mockResolvedValue(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(mockResults));
            controller.close();
          },
        }) as any
      );

      // Run the batch process
      const results = await service.processBatch(testBuffers, testMetadata);

      // Verify results
      expect(results).toHaveLength(2);
      expect(results[0].pageContent).toBe("result1");
      expect(results[1].pageContent).toBe("result2");

      // Verify the right APIs were called
      expect(mistralInstance.files.upload).toHaveBeenCalledTimes(1);
      expect(mistralInstance.batch.jobs.create).toHaveBeenCalledTimes(1);
      expect(mistralInstance.batch.jobs.get).toHaveBeenCalledTimes(1);
      expect(mistralInstance.files.download).toHaveBeenCalledTimes(1);
    });
  });
});
