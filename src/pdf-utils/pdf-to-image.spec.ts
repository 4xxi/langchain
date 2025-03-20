import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  convertPdfToImage,
  savePdfAsImage,
  savePdfAsImages,
} from "./pdf-to-image.js";

// Test directory for output files
const TEST_OUTPUT_DIR = path.join(process.cwd(), "test-output");
// Use the PDF from examples_data directory
const SAMPLE_PDF_PATH = path.join(
  process.cwd(),
  "example_data/file-sample_150kB.pdf"
);

describe("PDF to Image Converter", () => {
  // Create test directory before tests
  beforeAll(() => {
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
    // Verify the sample PDF exists
    if (!fs.existsSync(SAMPLE_PDF_PATH)) {
      throw new Error(`Sample PDF not found at: ${SAMPLE_PDF_PATH}`);
    }
  });

  // Clean up test directory after tests
  afterAll(() => {
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      const files = fs.readdirSync(TEST_OUTPUT_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_OUTPUT_DIR, file));
      }
      fs.rmdirSync(TEST_OUTPUT_DIR);
    }
  });

  it("should convert a PDF buffer to an image buffer", async () => {
    const pdfBuffer = fs.readFileSync(SAMPLE_PDF_PATH);
    const imageBuffer = await convertPdfToImage(pdfBuffer);

    // Check that we got a valid buffer back
    expect(imageBuffer).toBeInstanceOf(Buffer);
    expect(imageBuffer.length).toBeGreaterThan(0);
  });

  it("should save a PDF as an image file", async () => {
    const outputPath = path.join(TEST_OUTPUT_DIR, "output.png");

    await savePdfAsImage(SAMPLE_PDF_PATH, outputPath);

    // Check that the file was created
    expect(fs.existsSync(outputPath)).toBe(true);

    // Check that the file has content
    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("should save all PDF pages as separate image files", async () => {
    const outputPaths = await savePdfAsImages(SAMPLE_PDF_PATH, TEST_OUTPUT_DIR);

    // Check that we got at least one output file
    expect(outputPaths.length).toBeGreaterThan(0);

    // Check that all files exist and have content
    for (const filePath of outputPaths) {
      expect(fs.existsSync(filePath)).toBe(true);
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(0);
    }
  });
});
