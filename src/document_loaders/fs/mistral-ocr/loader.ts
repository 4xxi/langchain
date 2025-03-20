import fs from "fs";
import { Document } from "langchain/document";
import { BufferLoader } from "langchain/document_loaders/fs/buffer";
import path from "path";
import pdfParse from "pdf-parse";
import { MistralOcrService } from "./service.js";

export interface MistralOcrLoaderConfig {
  apiKey: string;
  modelName?: string;
  splitPages?: boolean;
  supportedImageTypes?: string[];
}

export class MistralOcrLoader extends BufferLoader {
  private readonly modelName: string;
  private readonly splitPages: boolean;
  private readonly ocrService: MistralOcrService;
  private readonly supportedImageTypes: string[];

  constructor(filePathOrBlob: string | Blob, config: MistralOcrLoaderConfig) {
    super(filePathOrBlob);
    if (!config.apiKey) {
      throw new Error("Mistral API key is required");
    }
    this.modelName = config.modelName || "mistral-ocr-latest";
    this.splitPages = config.splitPages ?? true;
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
    // For image files, we process directly through Mistral's OCR API
    const doc = await this.ocrService.processImage(buffer, metadata);
    return [doc];
  }

  private async processPdfFile(
    buffer: Buffer,
    metadata: Document["metadata"]
  ): Promise<Document[]> {
    // Extract PDF metadata only
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

    // Process PDF through Mistral's OCR API
    const documents = await this.ocrService.processPdf(buffer, baseMetadata);

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

  public override async load(): Promise<Document[]> {
    try {
      const filePath = this.filePathOrBlob as string;

      // Check if file exists first
      try {
        await fs.promises.access(filePath);
      } catch {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file and get metadata
      const buffer = await fs.promises.readFile(filePath);
      const metadata = { source: filePath };

      // Parse the buffer
      return this.parse(buffer, metadata);
    } catch (error) {
      const err = error as Error;
      throw err;
    }
  }

  public async parse(
    raw: Buffer,
    metadata: Document["metadata"]
  ): Promise<Document[]> {
    try {
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

      if (this.isPdfFile(filePath)) {
        return this.processPdfFile(raw, metadata);
      } else if (this.isImageFile(filePath)) {
        return this.processImageFile(raw, metadata);
      } else {
        throw new Error(`Unsupported file type: ${fileExt}`);
      }
    } catch (error) {
      const err = error as Error;
      throw err;
    }
  }
}
