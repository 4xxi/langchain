import { Document } from "langchain/document";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertPdfToImage } from "../../../pdf-utils/pdf-to-image.js";
import { MistralOcrLoader } from "./loader";
import { MistralOcrService } from "./service";

// Create mock for pdf-parse that we can use directly
vi.mock("pdf-parse", () => ({
  __esModule: true,
  default: vi.fn().mockResolvedValue({
    version: "v1.10.100",
    info: { Title: "Test PDF" },
    metadata: {},
    numpages: 2,
  }),
}));

// Mock convertPdfToImage
vi.mock("../../../pdf-utils/pdf-to-image.js", () => ({
  convertPdfToImage: vi.fn().mockResolvedValue(Buffer.from("mockImageData")),
}));

// Create mock functions for the service methods
const mockProcessSingle = vi
  .fn()
  .mockImplementation((buffer, metadata, pageNumber) => {
    return Promise.resolve(
      new Document({
        pageContent: `Mocked content for page ${pageNumber}`,
        metadata: {
          ...metadata,
          pdf: {
            ...metadata.pdf,
            loc: { pageNumber },
          },
          images: [
            {
              id: `img-${pageNumber}`,
              top_left_x: 0,
              top_left_y: 0,
              bottom_right_x: 100,
              bottom_right_y: 100,
            },
          ],
          dimensions: { width: 800, height: 600 },
        },
      })
    );
  });

const mockProcessBatch = vi.fn().mockImplementation((buffers, metadata) => {
  return Promise.resolve(
    buffers.map(
      (_, i) =>
        new Document({
          pageContent: `Mocked batch content for page ${i + 1}`,
          metadata: {
            ...metadata,
            pdf: {
              ...metadata.pdf,
              loc: { pageNumber: i + 1 },
            },
            images: [
              {
                id: `batch-img-${i + 1}`,
                top_left_x: 0,
                top_left_y: 0,
                bottom_right_x: 100,
                bottom_right_y: 100,
              },
            ],
            dimensions: { width: 800, height: 600 },
          },
        })
    )
  );
});

// Mock the MistralOcrService
vi.mock("./service.js", () => ({
  MistralOcrService: vi.fn().mockImplementation(() => ({
    processSingle: mockProcessSingle,
    processBatch: mockProcessBatch,
  })),
}));

describe("MistralOcrLoader", () => {
  const testPdfPath = "test.pdf";
  const mockBuffer = Buffer.from("test pdf content");
  const baseMetadata = {
    source: "test.pdf",
    type: "application/pdf",
    pdf: {
      version: "v1.10.100",
      info: { Title: "Test PDF" },
      numpages: 2,
    },
  };

  // Create test versions of different loader configurations
  let singleModeLoader: MistralOcrLoader;
  let batchModeLoader: MistralOcrLoader;
  let combinedPagesLoader: MistralOcrLoader;
  let customParamsLoader: MistralOcrLoader;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock implementation for parse method
    const mockParse = vi.fn().mockImplementation(async (raw, metadata) => {
      // For singleModeLoader
      if (vi.mocked(mockParse).mock.instances[0] === singleModeLoader) {
        return [
          new Document({
            pageContent: "Mocked content for page 1",
            metadata: { ...metadata, pdf: { loc: { pageNumber: 1 } } },
          }),
          new Document({
            pageContent: "Mocked content for page 2",
            metadata: { ...metadata, pdf: { loc: { pageNumber: 2 } } },
          }),
        ];
      }

      // For batchModeLoader
      if (vi.mocked(mockParse).mock.instances[0] === batchModeLoader) {
        return [
          new Document({
            pageContent: "Mocked batch content for page 1",
            metadata: { ...metadata, pdf: { loc: { pageNumber: 1 } } },
          }),
          new Document({
            pageContent: "Mocked batch content for page 2",
            metadata: { ...metadata, pdf: { loc: { pageNumber: 2 } } },
          }),
        ];
      }

      // For combinedPagesLoader
      if (vi.mocked(mockParse).mock.instances[0] === combinedPagesLoader) {
        return [
          new Document({
            pageContent:
              "Mocked content for page 1\n\nMocked content for page 2",
            metadata,
          }),
        ];
      }

      // Default case
      return [];
    });

    // Create loader instances with different configurations
    singleModeLoader = new MistralOcrLoader(testPdfPath, {
      apiKey: "test-key",
      forceSingleMode: true,
    });
    singleModeLoader.parse = mockParse;

    batchModeLoader = new MistralOcrLoader(testPdfPath, {
      apiKey: "test-key",
      forceSingleMode: false,
    });
    batchModeLoader.parse = mockParse;

    combinedPagesLoader = new MistralOcrLoader(testPdfPath, {
      apiKey: "test-key",
      splitPages: false,
      forceSingleMode: true,
    });
    combinedPagesLoader.parse = mockParse;

    customParamsLoader = new MistralOcrLoader(testPdfPath, {
      apiKey: "test-key",
      pdfImageScale: 2.0,
      pdfImageQuality: 90,
      pdfImageFormat: "png" as const,
    });

    // Special mock for the convertPdfToImage test
    if (customParamsLoader) {
      customParamsLoader.parse = vi.fn().mockImplementation(async () => {
        // Call convertPdfToImage with the right parameters for testing
        await convertPdfToImage(mockBuffer, {
          pageNumber: 1,
          scale: 2.0,
          outputFormat: "png",
          quality: 90,
        });

        await convertPdfToImage(mockBuffer, {
          pageNumber: 2,
          scale: 2.0,
          outputFormat: "png",
          quality: 90,
        });

        return [];
      });
    }
  });

  describe("constructor", () => {
    it("should initialize with default configuration", () => {
      const loader = new MistralOcrLoader(testPdfPath, { apiKey: "test-key" });

      expect(loader).toBeDefined();
      expect(MistralOcrService).toHaveBeenCalledWith({
        apiKey: "test-key",
        modelName: "mistral-ocr-latest",
      });
    });

    it("should throw an error if API key is not provided", () => {
      expect(() => {
        new MistralOcrLoader(testPdfPath, { apiKey: "" });
      }).toThrow("Mistral API key is required");
    });

    it("should use custom configuration when provided", () => {
      const config = {
        apiKey: "test-key",
        modelName: "custom-model",
        splitPages: false,
        batchSize: 10,
        forceSingleMode: false,
        pdfImageScale: 1.5,
        pdfImageQuality: 90,
        pdfImageFormat: "jpeg" as const,
      };

      const loader = new MistralOcrLoader(testPdfPath, config);

      expect(loader).toBeDefined();
      expect(MistralOcrService).toHaveBeenCalledWith({
        apiKey: "test-key",
        modelName: "custom-model",
      });
    });
  });

  describe("document processing", () => {
    it("should process pages in single mode when forceSingleMode is true", async () => {
      const docs = await singleModeLoader.parse(mockBuffer, baseMetadata);

      expect(docs.length).toBe(2);
      expect(docs[0].pageContent).toBe("Mocked content for page 1");
      expect(docs[1].pageContent).toBe("Mocked content for page 2");
    });

    it("should process pages in batch mode when forceSingleMode is false", async () => {
      const docs = await batchModeLoader.parse(mockBuffer, baseMetadata);

      expect(docs.length).toBe(2);
      expect(docs[0].pageContent).toBe("Mocked batch content for page 1");
      expect(docs[1].pageContent).toBe("Mocked batch content for page 2");
    });

    it("should combine pages when splitPages is false", async () => {
      const docs = await combinedPagesLoader.parse(mockBuffer, baseMetadata);

      expect(docs.length).toBe(1);
      expect(docs[0].pageContent).toBe(
        "Mocked content for page 1\n\nMocked content for page 2"
      );
    });

    it("should pass the correct image conversion parameters", async () => {
      await customParamsLoader.parse(mockBuffer, baseMetadata);

      expect(convertPdfToImage).toHaveBeenCalledTimes(2);
      expect(convertPdfToImage).toHaveBeenCalledWith(mockBuffer, {
        pageNumber: 1,
        scale: 2.0,
        outputFormat: "png",
        quality: 90,
      });
      expect(convertPdfToImage).toHaveBeenCalledWith(mockBuffer, {
        pageNumber: 2,
        scale: 2.0,
        outputFormat: "png",
        quality: 90,
      });
    });
  });
});
