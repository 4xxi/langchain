import * as path from "path";
import sharp, { FormatEnum } from "sharp";
import { fileURLToPath } from "url";
import { convertPdfToImage } from "../src/pdf-utils/pdf-to-image.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateTestImages() {
  const samplePdfPath = path.join(
    __dirname,
    "../example_data/file-sample_150kB.pdf"
  );
  const outputDir = path.join(__dirname, "../example_data");

  try {
    // Get the first page of the PDF as an image
    const pdfImage = await convertPdfToImage(samplePdfPath, {
      pageNumber: 1,
      scale: 2.0,
      outputFormat: "png",
      quality: 100,
    });

    // Save in different formats
    const formats = [
      { ext: "jpg" as keyof FormatEnum, options: { quality: 90 } },
      { ext: "png" as keyof FormatEnum },
      { ext: "webp" as keyof FormatEnum, options: { quality: 90 } },
    ];

    for (const format of formats) {
      const outputPath = path.join(outputDir, `sample.${format.ext}`);
      const sharpInstance = sharp(pdfImage);

      if (format.options) {
        await sharpInstance
          .toFormat(format.ext, format.options)
          .toFile(outputPath);
      } else {
        await sharpInstance.toFormat(format.ext).toFile(outputPath);
      }

      console.log(`Generated ${outputPath}`);
    }
  } catch (error) {
    console.error("Error generating test images:", error);
    process.exit(1);
  }
}

generateTestImages().catch(console.error);
