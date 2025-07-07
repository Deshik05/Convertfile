import { mkdirSync, writeFileSync } from "fs";
import { fromPath } from "pdf2pic";
import { createWorker } from "tesseract.js";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { join, dirname } from "path";

// Declare supported conversions
export const properties = {
  from: {
    scannedpdf: ["pdf"],
  },
  to: {
    scannedpdf: ["docx"],
  },
};

// ✅ Free typo corrector using LanguageTool via fetch
async function correctWithLanguageTool(text: string): Promise<string> {
  const res = await fetch("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      text,
      language: "en-US",
    }),
  });

  if (!res.ok) {
    throw new Error(`LanguageTool API failed: ${res.statusText}`);
  }

  const result = await res.json();

  let corrected = text;
  // Apply corrections in reverse to avoid messing up offsets
  for (let i = result.matches.length - 1; i >= 0; i--) {
    const match = result.matches[i];
    if (match.replacements && match.replacements.length > 0) {
      const replacement = match.replacements[0].value;
      corrected =
        corrected.slice(0, match.offset) +
        replacement +
        corrected.slice(match.offset + match.length);
    }
  }

  return corrected;
}

// ✅ Main convert function
export async function convert(
    filePath: string,
    fileType: string,
    convertTo: string,
    targetPath: string
  ): Promise<string> {
    if (fileType !== "pdf" || convertTo !== "docx") {
      throw new Error(`Unsupported conversion: ${fileType} to ${convertTo}`);
    }
  
    const imagesDir = join(dirname(targetPath), "tmp_images");
    mkdirSync(imagesDir, { recursive: true });
  
    const converter = fromPath(filePath, {
      density: 150,
      format: "png",
      width: 1024,
      height: 1024,
      savePath: imagesDir,
      saveFilename: "ocr-page",
    });
  
    try {
      const worker = await createWorker("eng");
  
      // 🔁 Convert all pages
      const allPages = await converter.bulk(-1); // -1 means all pages
      const fullTextLines: string[] = [];
  
      for (const page of allPages) {
        const {
          data: { text },
        } = await worker.recognize(page.path);
  
        if (text?.trim()) {
          fullTextLines.push(...text.trim().split("\n"));
        }
      }
  
      await worker.terminate();
  
      if (fullTextLines.length === 0) {
        throw new Error("No text found in scanned PDF.");
      }
  
      const fullText = fullTextLines.join("\n");
  
      // ✅ LanguageTool correction
      const correctedText = await correctWithLanguageTool(fullText);
  
      const doc = new Document({
        sections: [
          {
            children: correctedText.split("\n").map(
              (line) =>
                new Paragraph({
                  children: [new TextRun(line)],
                })
            ),
          },
        ],
      });
  
      const buffer = await Packer.toBuffer(doc);
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, buffer);
  
      return "Done";
    } catch (err) {
      console.error("OCR + typo correction failed:", err);
      throw err;
    }
  }
  