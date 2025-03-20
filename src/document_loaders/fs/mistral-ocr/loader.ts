import { Document } from "langchain/document";
import { BufferLoader } from "langchain/document_loaders/fs/buffer";
import path from "path";
import pdfParse from "pdf-parse";
import { convertPdfToImage } from "../../../pdf-utils/pdf-to-image.js";
import { MistralOcrService } from "./service.js";

export interface MistralOcrLoaderConfig {
  apiKey: string;
  modelName?: string;
  splitPages?: boolean;
  pdfImageScale?: number;
  pdfImageQuality?: number;
  pdfImageFormat?: "png" | "jpeg" | "webp";
  forceImageConversion?: boolean;
  supportedImageTypes?: string[];
}

export class MistralOcrLoader extends BufferLoader {
  private readonly modelName: string;
  private readonly splitPages: boolean;
  private readonly ocrService: MistralOcrService;
  private readonly pdfImageScale: number;
  private readonly pdfImageQuality: number;
  private readonly pdfImageFormat: "png" | "jpeg" | "webp";
  private readonly forceImageConversion: boolean;
  private readonly supportedImageTypes: string[];

  constructor(filePathOrBlob: string | Blob, config: MistralOcrLoaderConfig) {
    super(filePathOrBlob);
    if (!config.apiKey) {
      throw new Error("Mistral API key is required");
    }
    this.modelName = config.modelName || "mistral-ocr-latest";
    this.splitPages = config.splitPages ?? true;
    this.pdfImageScale = config.pdfImageScale ?? 2.0;
    this.pdfImageQuality = config.pdfImageQuality ?? 100;
    this.pdfImageFormat = config.pdfImageFormat ?? "png";
    this.forceImageConversion = config.forceImageConversion ?? false;
    this.supportedImageTypes = config.supportedImageTypes ?? [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".tiff",
      ".bmp",
      ".gif",
      ".pdf",
    ];
    this.ocrService = new MistralOcrService({
      apiKey: config.apiKey,
      modelName: this.modelName,
    });
  }

  /**
   * Process pages using single mode
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

  private isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedImageTypes.includes(ext) && ext !== ".pdf";
  }

  private isPdfFile(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === ".pdf";
  }

  private async processImageFile(
    buffer: Buffer,
    metadata: Document["metadata"]
  ): Promise<Document[]> {
    // For image files, we can process them directly
    const doc = await this.ocrService.processSingle(buffer, metadata);
    return [doc];
  }

  private async processPdfFile(
    buffer: Buffer,
    metadata: Document["metadata"]
  ): Promise<Document[]> {
    const pdfData = await pdfParse(buffer);
    const baseMetadata = {
      ...metadata,
      pdf: {
        version: pdfData.version,
        info: pdfData.info,
        metadata: pdfData.metadata,
        totalPages: pdfData.numpages,
      },
    };

    if (!this.forceImageConversion) {
      // If not forcing image conversion, use the text content directly
      return [
        new Document({
          pageContent: pdfData.text,
          metadata: baseMetadata,
        }),
      ];
    }

    try {
      // Convert each page to image
      const pages: Buffer[] = [];
      for (let i = 1; i <= pdfData.numpages; i++) {
        const imageBuffer = await convertPdfToImage(buffer, {
          pageNumber: i,
          scale: this.pdfImageScale,
          outputFormat: this.pdfImageFormat,
          quality: this.pdfImageQuality,
        });
        pages.push(imageBuffer);
      }

      // Process pages
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
    } catch (error: unknown) {
      const err = error as Error;
      return [
        new Document({
          pageContent: "",
          metadata: {
            ...baseMetadata,
            pdf: {
              ...baseMetadata.pdf,
              error: err.message,
            },
          },
        }),
      ];
    }
  }

  public async parse(
    raw: Buffer,
    metadata: Document["metadata"]
  ): Promise<Document[]> {
    const filePath = metadata.source as string;
    if (!filePath) {
      throw new Error("File path is required in metadata.source");
    }

    const fileExt = path.extname(filePath).toLowerCase();
    if (!this.supportedImageTypes.includes(fileExt)) {
      throw new Error(
        `Unsupported file type. Supported types: ${this.supportedImageTypes.join(", ")}`
      );
    }

    try {
      if (this.isPdfFile(filePath)) {
        return this.processPdfFile(raw, metadata);
      } else if (this.isImageFile(filePath)) {
        return this.processImageFile(raw, metadata);
      } else {
        throw new Error(`Unsupported file type: ${fileExt}`);
      }
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("ENOENT")) {
        throw new Error(`File not found: ${filePath}`);
      }
      throw err;
    }
  }
}
