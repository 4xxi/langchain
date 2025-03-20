import fs from "fs";
import path from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";

// CMap and font configurations
const CMAP_URL = path.join(process.cwd(), "node_modules/pdfjs-dist/cmaps/");
const CMAP_PACKED = true;
const STANDARD_FONT_DATA_URL = path.join(
  process.cwd(),
  "node_modules/pdfjs-dist/standard_fonts/"
);

// Define types for canvas factory to match pdfjs-dist expectations
interface CanvasAndContext {
  canvas: any;
  context: any;
}

export interface PdfToImageOptions {
  scale?: number;
  outputFormat?: "png" | "jpeg" | "webp";
  quality?: number;
  pageNumber?: number;
}

/**
 * Converts a PDF page to an image
 * @param input Path to PDF file or PDF buffer
 * @param options Conversion options
 * @returns Buffer containing image data
 */
export async function convertPdfToImage(
  input: string | Buffer,
  options: PdfToImageOptions = {}
): Promise<Buffer> {
  try {
    // Set default options
    const scale = options.scale || 2.0;
    const outputFormat = options.outputFormat || "png";
    const quality = options.quality || 100;
    const pageNumber = options.pageNumber || 1;

    // Load the PDF document
    let pdfData: Uint8Array;
    if (typeof input === "string") {
      pdfData = new Uint8Array(fs.readFileSync(input));
    } else {
      pdfData = new Uint8Array(input);
    }

    // Initialize PDF.js document
    const loadingTask = getDocument({
      data: pdfData,
      cMapUrl: CMAP_URL,
      cMapPacked: CMAP_PACKED,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
    });

    const pdfDocument = await loadingTask.promise;

    // Check if the requested page exists
    if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      throw new Error(
        `Invalid page number: ${pageNumber}. PDF has ${pdfDocument.numPages} pages.`
      );
    }

    // Get the requested page
    const page = await pdfDocument.getPage(pageNumber);

    // Calculate dimensions with scale
    const viewport = page.getViewport({ scale });

    // Use the canvas factory provided by the PDF document
    // @ts-expect-error - pdfDocument.canvasFactory is not in the type definitions but exists at runtime
    const canvasAndContext: CanvasAndContext = pdfDocument.canvasFactory.create(
      viewport.width,
      viewport.height
    );

    // Render the PDF page to the canvas
    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
    }).promise;

    // Convert canvas to image buffer
    let imageBuffer;
    try {
      // Get image data from canvas
      const pngBuffer = canvasAndContext.canvas.toBuffer("image/png");

      // Process with sharp for format conversion if needed
      if (outputFormat === "png") {
        imageBuffer = pngBuffer;
      } else {
        const sharpInstance = sharp(pngBuffer);

        // Set output format
        if (outputFormat === "jpeg") {
          sharpInstance.jpeg({ quality });
        } else if (outputFormat === "webp") {
          sharpInstance.webp({ quality });
        }

        imageBuffer = await sharpInstance.toBuffer();
      }
    } catch (error) {
      console.error("Image processing failed:", error);
      throw new Error(`Image processing failed: ${(error as Error).message}`);
    }

    // Clean up resources
    page.cleanup();
    // @ts-expect-error - pdfDocument.canvasFactory is not in the type definitions but exists at runtime
    pdfDocument.canvasFactory.destroy(canvasAndContext);

    return imageBuffer;
  } catch (error) {
    console.error("PDF to image conversion error:", error);
    throw new Error(
      `Failed to convert PDF to image: ${(error as Error).message}`
    );
  }
}

/**
 * Converts all pages of a PDF to images
 * @param input Path to PDF file or PDF buffer
 * @param options Conversion options
 * @returns Array of buffers containing image data for each page
 */
export async function convertPdfToImages(
  input: string | Buffer,
  options: Omit<PdfToImageOptions, "pageNumber"> = {}
): Promise<Buffer[]> {
  try {
    // Load the PDF document to get page count
    let pdfData: Uint8Array;
    if (typeof input === "string") {
      pdfData = new Uint8Array(fs.readFileSync(input));
    } else {
      pdfData = new Uint8Array(input);
    }

    const loadingTask = getDocument({
      data: pdfData,
      cMapUrl: CMAP_URL,
      cMapPacked: CMAP_PACKED,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
    });

    const pdfDocument = await loadingTask.promise;
    const pageCount = pdfDocument.numPages;

    // Convert each page
    const imageBuffers: Buffer[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const imageBuffer = await convertPdfToImage(input, {
        ...options,
        pageNumber: i,
      });
      imageBuffers.push(imageBuffer);
    }

    return imageBuffers;
  } catch (error) {
    console.error("PDF to images conversion error:", error);
    throw new Error(
      `Failed to convert PDF to images: ${(error as Error).message}`
    );
  }
}

/**
 * Save a PDF page as an image file
 * @param input Path to PDF file or PDF buffer
 * @param outputPath Path where the image will be saved
 * @param options Conversion options
 */
export async function savePdfAsImage(
  input: string | Buffer,
  outputPath: string,
  options: PdfToImageOptions = {}
): Promise<void> {
  const imageBuffer = await convertPdfToImage(input, options);
  fs.writeFileSync(outputPath, imageBuffer);
}

/**
 * Save all PDF pages as image files
 * @param input Path to PDF file or PDF buffer
 * @param outputDir Directory where images will be saved
 * @param options Conversion options
 * @returns Array of paths to the saved image files
 */
export async function savePdfAsImages(
  input: string | Buffer,
  outputDir: string,
  options: Omit<PdfToImageOptions, "pageNumber"> = {}
): Promise<string[]> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const imageBuffers = await convertPdfToImages(input, options);
  const outputFormat = options.outputFormat || "png";
  const outputPaths: string[] = [];

  // Save each image
  for (let i = 0; i < imageBuffers.length; i++) {
    const pageNum = i + 1;
    const outputPath = path.join(outputDir, `page-${pageNum}.${outputFormat}`);
    fs.writeFileSync(outputPath, imageBuffers[i]);
    outputPaths.push(outputPath);
  }

  return outputPaths;
}
