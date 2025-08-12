import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { FormData } from "undici"; // Bun uses undici internally

// 🧩 Supported conversions
export const properties = {
  from: {
    scannedfile: ["pdf", "png", "jpg", "jpeg"],
  },
  to: {
    scannedfile: ["xlsx"],
  },
};

// 🧠 Convert function: send file to Python img2table service and save XLSX
export async function convert(
  filePath: string,
  fileType: string,
  convertTo: string,
  targetPath: string
): Promise<string> {
  if (!["pdf", "png", "jpg", "jpeg"].includes(fileType)) {
    throw new Error(`Unsupported input file type: ${fileType}`);
  }

  if (convertTo !== "xlsx") {
    throw new Error(`Unsupported output type: ${convertTo}`);
  }

  try {
    const fileBuffer = readFileSync(filePath);
    const form = new FormData();
    form.set("file", new Blob([fileBuffer]), basename(filePath));

    const response = await fetch("http://localhost:5005/extract-table", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`img2table extraction failed: ${err}`);
    }

    const outputBuffer = await response.arrayBuffer();
    const outputDir = dirname(targetPath);
    await Bun.write(targetPath, new Uint8Array(outputBuffer));

    return "Done";
  } catch (err) {
    console.error("Error in convert():", err);
    throw err;
  }
}
