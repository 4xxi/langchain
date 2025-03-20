import { Document } from "langchain/document";
import { BufferLoader } from "langchain/document_loaders/fs/buffer";
import pdfParse from "pdf-parse";
import { convertPdfToImage } from "../../../pdf-utils/pdf-to-image.js";
import { MistralOcrService } from "./service.js";

export interface MistralOcrLoaderConfig {
  apiKey: string;
  modelName?: string;
  splitPages?: boolean;
  batchSize?: number;
  forceSingleMode?: boolean;
  pdfImageScale?: number;
  pdfImageQuality?: number;
  pdfImageFormat?: "png" | "jpeg" | "webp";
}

export class MistralOcrLoader extends BufferLoader {
  private readonly modelName: string;
  private readonly splitPages: boolean;
  private readonly batchSize: number;
  private readonly ocrService: MistralOcrService;
  private readonly forceSingleMode: boolean;
  private readonly pdfImageScale: number;
  private readonly pdfImageQuality: number;
  private readonly pdfImageFormat: "png" | "jpeg" | "webp";

  constructor(filePathOrBlob: string | Blob, config: MistralOcrLoaderConfig) {
    super(filePathOrBlob);
    if (!config.apiKey) {
      throw new Error("Mistral API key is required");
    }
    this.modelName = config.modelName || "mistral-ocr-latest";
    this.splitPages = config.splitPages ?? true;
    this.batchSize = config.batchSize ?? 5;
    this.forceSingleMode = config.forceSingleMode ?? true;
    this.pdfImageScale = config.pdfImageScale ?? 2.0;
    this.pdfImageQuality = config.pdfImageQuality ?? 100;
    this.pdfImageFormat = config.pdfImageFormat ?? "png";
    this.ocrService = new MistralOcrService({
      apiKey: config.apiKey,
      modelName: this.modelName,
    });
  }

  /**
   * Process pages using either single or batch mode
   * @param pages Array of page image buffers
   * @param metadata Document metadata
   * @returns Array of processed documents
   */
  private async processPages(
    pages: Buffer[],
    metadata: Document["metadata"]
  ): Promise<Document[]> {
    if (pages.length === 0) {
      return [];
    }

    if (this.forceSingleMode || pages.length === 1) {
      // Process pages one by one
      const documents: Document[] = [];
      for (let i = 0; i < pages.length; i++) {
        const doc = await this.ocrService.processSingle(
          pages[i],
          metadata,
          i + 1
        );
        documents.push(doc);
      }
      return documents;
    }

    // Use batch processing for multiple pages
    const documents: Document[] = [];
    for (let i = 0; i < pages.length; i += this.batchSize) {
      const batch = pages.slice(i, i + this.batchSize);
      const batchDocs = await this.ocrService.processBatch(batch, metadata);
      documents.push(...batchDocs);
    }
    return documents;
  }

  public async parse(
    raw: Buffer,
    metadata: Document["metadata"]
  ): Promise<Document[]> {
    const pdfData = await pdfParse(raw);

    const baseMetadata = {
      ...metadata,
      pdf: {
        version: pdfData.version,
        info: pdfData.info,
        metadata: pdfData.metadata,
        totalPages: pdfData.numpages,
      },
    };

    // Convert each page to image using the external utility
    const pages: Buffer[] = [];
    for (let i = 1; i <= pdfData.numpages; i++) {
      try {
        const imageBuffer = await convertPdfToImage(raw, {
          pageNumber: i,
          scale: this.pdfImageScale,
          outputFormat: this.pdfImageFormat,
          quality: this.pdfImageQuality,
        });
        pages.push(imageBuffer);
      } catch (error: unknown) {
        const err = error as Error;
        return [
          new Document({
            pageContent: "",
            metadata: {
              ...baseMetadata,
              pdf: {
                ...baseMetadata.pdf,
                loc: { pageNumber: i },
                error: err.message,
              },
            },
          }),
        ];
      }
    }

    // Process pages using appropriate method
    const documents = await this.processPages(pages, baseMetadata);

    if (!this.splitPages) {
      return [
        new Document({
          pageContent: documents.map((doc) => doc.pageContent).join("\n\n"),
          metadata: baseMetadata,
        }),
      ];
    }

    return documents;
  }
}
