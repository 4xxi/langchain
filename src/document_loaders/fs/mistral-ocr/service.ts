import { Mistral } from "@mistralai/mistralai";
import type { OCRImageObject } from "@mistralai/mistralai/models/components/index.js";
import {
  BatchJobStatus,
  FilePurpose,
} from "@mistralai/mistralai/models/components/index.js";
import * as fs from "fs";
import { Document } from "langchain/document";
import * as os from "os";
import * as path from "path";

interface BatchOcrRequest {
  custom_id: string;
  body: {
    model: string;
    document: {
      type: "image_url";
      imageUrl: string;
    };
    includeImageBase64: boolean;
  };
}

export interface MistralOcrServiceConfig {
  apiKey: string;
  modelName?: string;
}

interface Error {
  message: string;
}

export interface OcrImage {
  id: string;
  topLeftX: number | null;
  topLeftY: number | null;
  bottomRightX: number | null;
  bottomRightY: number | null;
  imageBase64: string | null;
}

export class MistralOcrService {
  private readonly mistralClient: Mistral;
  private readonly modelName: string;

  constructor(config: MistralOcrServiceConfig) {
    if (!config.apiKey) {
      throw new Error("Mistral API key is required");
    }
    this.mistralClient = new Mistral({ apiKey: config.apiKey });
    this.modelName = config.modelName || "mistral-ocr-latest";
  }

  /**
   * Process a single page using direct OCR API call
   * @param pageBuffer Buffer containing the page image
   * @param metadata Document metadata
   * @param pageNumber Page number (1-indexed)
   * @returns Document with OCR results
   */
  async processSingle(
    pageBuffer: Buffer,
    metadata: Document["metadata"],
    pageNumber = 1
  ): Promise<Document> {
    try {
      const base64Data = pageBuffer.toString("base64");
      const response = await this.mistralClient.ocr.process({
        model: this.modelName,
        document: {
          type: "image_url",
          imageUrl: `data:image/png;base64,${base64Data}`,
        },
        includeImageBase64: true,
      });
      console.log("--------------------------------");
      console.debug(response);
      console.log("--------------------------------");

      // Extract image information if available
      const imageMetadata =
        response.pages[0].images?.map((image: OCRImageObject) => ({
          id: image.id,
          top_left_x: image.topLeftX ?? 0,
          top_left_y: image.topLeftY ?? 0,
          bottom_right_x: image.bottomRightX ?? 0,
          bottom_right_y: image.bottomRightY ?? 0,
          image_base64: image.imageBase64 ?? undefined,
        })) || [];

      // Extract page dimensions if available
      const dimensions = response.pages[0].dimensions || null;

      return new Document({
        pageContent: response.pages[0].markdown,
        metadata: {
          ...metadata,
          pdf: {
            ...metadata.pdf,
            loc: { pageNumber },
          },
          images: imageMetadata,
          dimensions: dimensions,
        },
      });
    } catch (error: unknown) {
      const err = error as Error;
      return new Document({
        pageContent: "",
        metadata: {
          ...metadata,
          pdf: {
            ...metadata.pdf,
            loc: { pageNumber },
            error: err.message,
          },
        },
      });
    }
  }

  private async createBatchFile(requests: BatchOcrRequest[]): Promise<string> {
    // Create a temporary file in the system's temporary directory
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "mistral-ocr-")
    );
    const tempFilePath = path.join(tempDir, `batch-${Date.now()}.jsonl`);

    const jsonlContent = requests.map((req) => JSON.stringify(req)).join("\n");
    await fs.promises.writeFile(tempFilePath, jsonlContent);
    return tempFilePath;
  }

  private async uploadBatchFile(filePath: string) {
    const fileContent = await fs.promises.readFile(filePath);
    const batchData = await this.mistralClient.files.upload({
      file: {
        fileName: path.basename(filePath),
        content: fileContent,
      },
      purpose: FilePurpose.Batch,
    });
    return batchData.id;
  }

  private async createBatchJob(fileId: string) {
    const createdJob = await this.mistralClient.batch.jobs.create({
      inputFiles: [fileId],
      model: this.modelName,
      endpoint: "ocr/process" as any,
      metadata: { jobType: "bulk_ocr_processing" },
    });
    return createdJob.id;
  }

  private async waitForJobCompletion(
    jobId: string,
    maxAttempts = 30,
    delayMs = 5000
  ): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const job = await this.mistralClient.batch.jobs.get({ jobId });

      if (job.status === BatchJobStatus.Failed) {
        throw new Error(
          `Batch job failed: ${job.errors?.join(", ") || "Unknown error"}`
        );
      }

      if (job.status === BatchJobStatus.Success) {
        const outputFile = job.outputFile;
        if (outputFile) {
          return outputFile;
        }
        throw new Error("Job completed but no output file was found");
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error("Batch job timed out");
  }

  private async downloadResults(fileId: string): Promise<any[]> {
    const outputFile = await this.mistralClient.files.download({ fileId });
    const reader = outputFile.getReader();
    const chunks: Uint8Array[] = [];

    let isDone = false;
    while (!isDone) {
      const { done, value } = await reader.read();
      isDone = done;
      if (done) break;
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    try {
      const results = buffer
        .toString()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      return results;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to parse batch results: ${err.message}`);
    }
  }

  private async cleanupTempFiles(filePath: string): Promise<void> {
    try {
      const tempDir = path.dirname(filePath);
      await fs.promises.rm(filePath);
      await fs.promises.rmdir(tempDir);
    } catch (error: unknown) {
      const err = error as Error;
      console.warn(`Failed to cleanup temp files: ${err.message}`);
    }
  }

  /**
   * Process multiple pages using batch API
   */
  async processBatch(
    pages: Buffer[],
    metadata: Document["metadata"]
  ): Promise<Document[]> {
    if (pages.length === 0) {
      return [];
    }

    if (pages.length === 1) {
      return [await this.processSingle(pages[0], metadata)];
    }

    // Create batch requests
    const requests: BatchOcrRequest[] = pages.map((pageBuffer, index) => ({
      custom_id: `page_${index + 1}`,
      body: {
        model: this.modelName,
        document: {
          type: "image_url",
          imageUrl: `data:image/png;base64,${pageBuffer.toString("base64")}`,
        },
        includeImageBase64: true,
      },
    }));

    try {
      // Create and upload batch file
      const batchFilePath = await this.createBatchFile(requests);
      const fileId = await this.uploadBatchFile(batchFilePath);

      try {
        // Create and monitor batch job
        const jobId = await this.createBatchJob(fileId);
        const outputFileId = await this.waitForJobCompletion(jobId);
        const results = await this.downloadResults(outputFileId);

        // Process results into Documents
        return results.map((result, index) => {
          if (result.error) {
            return new Document({
              pageContent: "",
              metadata: {
                ...metadata,
                pdf: {
                  ...metadata.pdf,
                  loc: { pageNumber: index + 1 },
                  error: result.error,
                },
              },
            });
          }

          // Extract image information if available
          const imageMetadata =
            result.response.pages[0].images?.map((image: OCRImageObject) => ({
              id: image.id,
              top_left_x: image.topLeftX ?? 0,
              top_left_y: image.topLeftY ?? 0,
              bottom_right_x: image.bottomRightX ?? 0,
              bottom_right_y: image.bottomRightY ?? 0,
              image_base64: image.imageBase64 ?? undefined,
            })) || [];

          // Extract page dimensions if available
          const dimensions = result.response.pages[0].dimensions || null;

          return new Document({
            pageContent: result.response.pages[0].markdown,
            metadata: {
              ...metadata,
              pdf: {
                ...metadata.pdf,
                loc: { pageNumber: index + 1 },
              },
              images: imageMetadata,
              dimensions: dimensions,
            },
          });
        });
      } finally {
        // Clean up temporary files
        await this.cleanupTempFiles(batchFilePath);
      }
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Batch processing failed: ${err.message}`);
    }
  }
}
