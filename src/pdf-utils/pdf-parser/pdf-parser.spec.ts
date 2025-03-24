import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { parsePDF, renderPage } from "./pdf-parser";

describe("PDF Parser", () => {
  const samplePdfPath = join(process.cwd(), "example_data", "nke-10k-2023.pdf");
  const smallPdfPath = join(
    process.cwd(),
    "example_data",
    "file-sample_150kB.pdf"
  );

  it("should export renderPage function", () => {
    expect(renderPage).toBeInstanceOf(Function);
  });

  it("should export parsePDF function", () => {
    expect(parsePDF).toBeInstanceOf(Function);
  });

  it("should parse a PDF and extract text", async () => {
    const buffer = await readFile(smallPdfPath);
    const pdfBuffer = new Uint8Array(buffer);
    const result = await parsePDF(pdfBuffer);

    expect(result).toBeDefined();
    expect(result.numpages).toBeGreaterThan(0);
    expect(result.numrender).toBeGreaterThan(0);
    expect(result.text).toBeTruthy();
    expect(result.version).toBeTruthy();
  });

  it("should limit the number of pages processed when max option is provided", async () => {
    const buffer = await readFile(samplePdfPath);
    const pdfBuffer = new Uint8Array(buffer);
    const result = await parsePDF(pdfBuffer, { max: 1 });

    expect(result.numpages).toBeGreaterThan(1); // The actual document has more pages
    expect(result.numrender).toBe(1); // But we only processed 1
  });

  it("should use custom page renderer when provided", async () => {
    const customRenderer = vi.fn().mockResolvedValue("Custom rendered text");
    const buffer = await readFile(smallPdfPath);
    const pdfBuffer = new Uint8Array(buffer);

    const result = await parsePDF(pdfBuffer, {
      pagerender: customRenderer,
      max: 1,
    });

    expect(customRenderer).toHaveBeenCalled();
    expect(result.text).toContain("Custom rendered text");
  });

  it("should handle errors gracefully during rendering", async () => {
    const mockConsoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const failingRenderer = vi
      .fn()
      .mockRejectedValue(new Error("Rendering failed"));
    const buffer = await readFile(smallPdfPath);
    const pdfBuffer = new Uint8Array(buffer);

    // Should not throw
    const result = await parsePDF(pdfBuffer, {
      pagerender: failingRenderer,
    });

    expect(mockConsoleError).toHaveBeenCalled();
    // Since we're not adding error text to the output, the text will be empty or just contain newlines
    expect(result).toBeDefined();

    mockConsoleError.mockRestore();
  });
});
