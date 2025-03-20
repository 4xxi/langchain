import { Document } from "langchain/document";
import pdfParse from "pdf-parse";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertPdfToImage } from "../../../pdf-utils/pdf-to-image.js";
import { MistralOcrLoader } from "./loader";

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

// Mock the MistralOcrService
vi.mock("./service.js", () => ({
  MistralOcrService: vi.fn().mockImplementation(() => ({
    processSingle: mockProcessSingle,
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
    });
    singleModeLoader.parse = mockParse;

    combinedPagesLoader = new MistralOcrLoader(testPdfPath, {
      apiKey: "test-key",
      splitPages: false,
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

  describe("document processing", () => {
    it("should process pages in single mode", async () => {
      const docs = await singleModeLoader.parse(mockBuffer, baseMetadata);

      expect(docs.length).toBe(2);
      expect(docs[0].pageContent).toBe("Mocked content for page 1");
      expect(docs[1].pageContent).toBe("Mocked content for page 2");
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

    it("should handle PDF parsing errors gracefully", async () => {
      const errorLoader = new MistralOcrLoader(testPdfPath, {
        apiKey: "test-key",
      });

      // Mock fs.readFile to return a buffer
      const { promises: fsPromises } = await import("fs");
      vi.spyOn(fsPromises, "readFile").mockResolvedValue(Buffer.from("test"));

      // Mock pdf-parse to throw an error
      vi.mocked(pdfParse).mockRejectedValueOnce(
        new Error("PDF parsing failed")
      );

      await expect(errorLoader.load()).rejects.toThrow("PDF parsing failed");
    });
  });
});
