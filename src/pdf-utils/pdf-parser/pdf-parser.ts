import path from "path";
import { getDocument, version } from "pdfjs-dist/legacy/build/pdf.mjs";
// CMap and font configurations
const CMAP_URL = path.join(process.cwd(), "node_modules/pdfjs-dist/cmaps/");
const CMAP_PACKED = true;
const STANDARD_FONT_DATA_URL = path.join(
  process.cwd(),
  "node_modules/pdfjs-dist/standard_fonts/"
);

/**
 * Default render page function for extracting text content from PDF pages
 * @param pageData Page data object from PDF.js
 * @returns Promise resolving to the extracted text
 */
export async function renderPage(pageData: any): Promise<string> {
  const renderOptions = {
    // replaces all occurrences of whitespace with standard spaces (0x20)
    normalizeWhitespace: false,
    // do not attempt to combine same line TextItem's
    disableCombineTextItems: false,
  };

  try {
    const textContent = await pageData.getTextContent(renderOptions);
    let lastY: number | null = null;
    let text = "";

    // Group text items by their vertical position to maintain paragraph structure
    for (const item of textContent.items) {
      if (lastY === item.transform[5] || lastY === null) {
        text += item.str;
      } else {
        text += "\n" + item.str;
      }
      lastY = item.transform[5];
    }

    return text;
  } catch (error) {
    console.error("Error rendering PDF page:", error);
    return "";
  }
}

/**
 * Default options for PDF parsing
 */
export const DEFAULT_OPTIONS = {
  pagerender: renderPage,
  // Maximum number of pages to process (0 means all pages)
  max: 0,
};

/**
 * Result of PDF parsing
 */
export interface PDFParseResult {
  numpages: number;
  numrender: number;
  info: any;
  metadata: any;
  text: string;
  version: string;
}

/**
 * Options for PDF parsing
 */
export interface PDFParseOptions {
  pagerender?: (pageData: any) => Promise<string>;
  max?: number;
}

/**
 * Convert a Buffer to Uint8Array
 * @param buffer Node.js Buffer or ArrayBuffer or Uint8Array
 * @returns Uint8Array
 */
function ensureUint8Array(
  buffer: Buffer | ArrayBuffer | Uint8Array
): Uint8Array {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }

  if (Buffer.isBuffer(buffer)) {
    return new Uint8Array(buffer);
  }

  return new Uint8Array(buffer);
}

/**
 * Parse a PDF buffer and extract its text content
 * @param dataBuffer PDF data buffer
 * @param options Parsing options
 * @returns Promise resolving to the PDF parsing result
 */
export async function parsePDF(
  dataBuffer: Buffer | ArrayBuffer | Uint8Array,
  options?: PDFParseOptions
): Promise<PDFParseResult> {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // Initialize result object
  const result: PDFParseResult = {
    numpages: 0,
    numrender: 0,
    info: null,
    metadata: null,
    text: "",
    version: version, // Hard-coded version as we're not importing the full pdfjsLib
  };

  try {
    // Convert input to Uint8Array if it's a Node.js Buffer
    const uint8Array = ensureUint8Array(dataBuffer);

    // Load the PDF document with the proper configuration
    const loadingTask = getDocument({
      data: uint8Array,
      cMapUrl: CMAP_URL,
      cMapPacked: CMAP_PACKED,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
    });

    const pdfDocument = await loadingTask.promise;

    result.numpages = pdfDocument.numPages;

    // Get metadata if available
    try {
      const metaData = await pdfDocument.getMetadata();
      result.info = metaData?.info || null;
      result.metadata = metaData?.metadata || null;
    } catch (error) {
      console.error("Error retrieving PDF metadata:", error);
    }

    // Calculate number of pages to process
    const counter =
      opts.max <= 0
        ? pdfDocument.numPages
        : Math.min(opts.max, pdfDocument.numPages);
    result.numrender = counter;

    // Process each page
    for (let i = 1; i <= counter; i++) {
      try {
        const page = await pdfDocument.getPage(i);
        const pageText = await opts.pagerender(page);
        result.text += `\n\n${pageText}`;
      } catch (error) {
        console.error(`Error processing page ${i}:`, error);
        // Just log the error, don't add error messages to the text output
      }
    }

    // Clean up
    pdfDocument.destroy();

    return result;
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw error;
  }
}
