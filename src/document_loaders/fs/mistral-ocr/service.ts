import { Mistral } from "@mistralai/mistralai";
import type { OCRImageObject } from "@mistralai/mistralai/models/components/index.js";
import { Document } from "langchain/document";

export class MistralOcrService {
  private readonly mistralClient: Mistral;
  private readonly modelName: string;

  constructor(config: { apiKey: string; modelName?: string }) {
    this.mistralClient = new Mistral({ apiKey: config.apiKey });
    this.modelName = config.modelName || "mistral-ocr-latest";
  }

  /**
   * Process an image using OCR
   */
  async processImage(
    buffer: Buffer,
    metadata: Document["metadata"]
  ): Promise<Document> {
    try {
      // Determine the image format from the buffer magic numbers
      let mimeType = "image/png";
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        mimeType = "image/jpeg";
      } else if (buffer[0] === 0x52 && buffer[1] === 0x49) {
        mimeType = "image/webp";
      }

      const response = await this.mistralClient.ocr.process({
        model: this.modelName,
        document: {
          type: "image_url",
          imageUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
        },
        includeImageBase64: true,
      });

      if (!response.pages || !response.pages[0]) {
        throw new Error("Malformed response structure");
      }

      const page = response.pages[0];
      return new Document({
        pageContent: page.markdown || "",
        metadata: {
          ...metadata,
          images:
            page.images?.map((image: OCRImageObject) => ({
              id: image.id,
              top_left_x: image.topLeftX ?? 0,
              top_left_y: image.topLeftY ?? 0,
              bottom_right_x: image.bottomRightX ?? 0,
              bottom_right_y: image.bottomRightY ?? 0,
              image_base64: image.imageBase64 ?? undefined,
            })) || [],
          dimensions: page.dimensions || null,
        },
      });
    } catch (error) {
      const err = error as Error;
      throw new Error(`OCR processing failed: ${err.message}`);
    }
  }

  /**
   * Process a PDF file using OCR
   */
  async processPdf(
    buffer: Buffer,
    metadata: Document["metadata"]
  ): Promise<Document[]> {
    try {
      const response = await this.mistralClient.ocr.process({
        model: this.modelName,
        document: {
          type: "document_url",
          documentUrl: `data:application/pdf;base64,${buffer.toString("base64")}`,
        },
        includeImageBase64: true,
      });

      if (!response.pages) {
        throw new Error("Malformed response structure");
      }

      return response.pages.map((page, index) => {
        return new Document({
          pageContent: page.markdown || "",
          metadata: {
            ...metadata,
            pdf: {
              ...metadata.pdf,
              loc: { pageNumber: index + 1 },
            },
            images:
              page.images?.map((image: OCRImageObject) => ({
                id: image.id,
                top_left_x: image.topLeftX ?? 0,
                top_left_y: image.topLeftY ?? 0,
                bottom_right_x: image.bottomRightX ?? 0,
                bottom_right_y: image.bottomRightY ?? 0,
                image_base64: image.imageBase64 ?? undefined,
              })) || [],
            dimensions: page.dimensions || null,
          },
        });
      });
    } catch (error) {
      const err = error as Error;
      throw new Error(`OCR processing failed: ${err.message}`);
    }
  }
}
