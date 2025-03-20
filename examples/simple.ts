import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

// Import using package name and subpath
import { MistralOcrLoader } from "@4xxi/langchain/document_loaders/fs/mistral-ocr";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY environment variable is required");
  }

  // Path to your PDF file - using the sample file
  const pdfPath = path.join(__dirname, "../example_data/file-sample_150kB.pdf");

  // Initialize the loader
  const loader = new MistralOcrLoader(pdfPath, {
    apiKey,
    splitPages: true,
    forceSingleMode: true,
    modelName: "mistral-ocr-latest",
  });

  try {
    console.log("Starting OCR processing...");
    const docs = await loader.load();

    console.log(`Successfully processed ${docs.length} pages`);

    // Print results for each page
    docs.forEach((doc, index) => {
      console.log(`\n=== Page ${index + 1} ===`);
      console.log("Content:", doc.pageContent.substring(0, 200) + "...");
      console.log("Metadata:", JSON.stringify(doc.metadata, null, 2));
    });
  } catch (error) {
    console.error("Error processing PDF:", error);
    throw error;
  }
}

main().catch(console.error);
