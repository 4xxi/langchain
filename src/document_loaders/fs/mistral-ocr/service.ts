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
   * Process a single page using OCR
   */
  async processSingle(
    buffer: Buffer,
    metadata: Document["metadata"],
    pageNumber?: number
  ): Promise<Document> {
    try {
      const response = await this.mistralClient.ocr.process({
        model: this.modelName,
        document: {
          type: "image_url",
          imageUrl: `data:image/png;base64,${buffer.toString("base64")}`,
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
          pdf: {
            ...metadata.pdf,
            loc: pageNumber ? { pageNumber } : undefined,
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
    } catch (error) {
      const err = error as Error;
      throw new Error(`OCR processing failed: ${err.message}`);
    }
  }
}
