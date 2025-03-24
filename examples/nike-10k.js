import { MistralOcrLoader } from "@4xxi/langchain/document_loaders/fs/mistral-ocr";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
// Load environment variables
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function main() {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
        throw new Error("MISTRAL_API_KEY environment variable is required");
    }
    // Path to Nike's 10-K report
    const pdfPath = path.join(__dirname, "../../example_data/nke-10k-2023.pdf");
    // Initialize the loader with specific settings for large documents
    const loader = new MistralOcrLoader(pdfPath, {
        apiKey,
        splitPages: true,
        modelName: "mistral-ocr-latest",
    });
    try {
        console.log("Starting OCR processing of Nike's 10-K report...");
        const docs = await loader.load();
        console.log(`Successfully processed ${docs.length} pages`);
        // Print summary of each page
        docs.forEach((doc, index) => {
            console.log(`\n=== Page ${index + 1} ===`);
            // Print first 200 characters of content
            console.log("Content Preview:", doc.pageContent.substring(0, 200) + "...");
            // Print metadata including page numbers and any detected tables/sections
            console.log("Metadata:", JSON.stringify(doc.metadata, null, 2));
        });
    }
    catch (error) {
        console.error("Error processing Nike's 10-K report:", error);
        throw error;
    }
}
main().catch(console.error);
