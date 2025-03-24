import fs from "fs";
import path from "path";
import { parsePDF, renderPage } from "./pdf-parser.js";

// Example of using the PDF parser
async function main() {
  try {
    // Path to the sample PDF
    const samplePdfPath = path.join(
      process.cwd(),
      "example_data",
      "file-sample_150kB.pdf"
    );

    // Read the PDF file and convert buffer to Uint8Array for the first example
    const buffer = fs.readFileSync(samplePdfPath);
    const pdfData = new Uint8Array(buffer);

    console.log("Parsing PDF...");

    // Parse the PDF with default options (all pages)
    const result = await parsePDF(pdfData);

    console.log("PDF parsing complete.");
    console.log(`Number of pages: ${result.numpages}`);
    console.log(`Pages rendered: ${result.numrender}`);

    // Display metadata if available
    if (result.info) {
      console.log("\nDocument Info:");
      console.log(JSON.stringify(result.info, null, 2));
    }

    // Display first 500 characters of the extracted text
    const previewLength = 500;
    console.log("\nText Preview:");
    const textPreview =
      result.text.length > previewLength
        ? `${result.text.substring(0, previewLength)}...`
        : result.text;
    console.log(textPreview);

    // Create a new buffer for the second example to avoid document reuse issues
    const buffer2 = fs.readFileSync(samplePdfPath);
    const pdfData2 = new Uint8Array(buffer2);

    // Example with a custom page renderer
    console.log("\nParsing with custom renderer...");
    const customResult = await parsePDF(pdfData2, {
      pagerender: async (page) => {
        const defaultText = await renderPage(page);
        return `[Custom Renderer] ${defaultText}`;
      },
      max: 2, // Only process the first 2 pages
    });

    console.log(
      `Pages rendered with custom renderer: ${customResult.numrender}`
    );
    console.log("\nCustom Text Preview:");
    const customTextPreview =
      customResult.text.length > previewLength
        ? `${customResult.text.substring(0, previewLength)}...`
        : customResult.text;
    console.log(customTextPreview);
  } catch (error) {
    console.error("Error running example:", error);
  }
}

// Run the example
main();
