import { resolve } from "node:path";
import sharp from "sharp";
import { OEM, PSM, createWorker, type Worker } from "tesseract.js";
import {
  definePDFJSModule,
  extractText,
  getDocumentProxy,
  renderPageAsImage,
} from "unpdf";

let ocrWorkerPromise: Promise<Worker> | null = null;
let pdfModulePromise: Promise<void> | null = null;

export async function extractImageTextLocally(buffer: Buffer) {
  const prepared = await sharp(buffer, { failOn: "none" })
    .rotate()
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
  const worker = await getOcrWorker();
  const result = await worker.recognize(prepared);
  return normalizeExtractedText(result.data.text);
}

export async function extractPdfTextLocally(buffer: Buffer) {
  return (await extractPdfDocumentLocally(buffer)).text;
}

export type PdfExtractionResult = {
  text: string;
  status: "complete" | "partial";
  completeness: number;
  pageCount: number;
  extractedPageCount: number;
  ocrPageCount: number;
  missingPageCount: number;
};

export async function extractPdfDocumentLocally(
  buffer: Buffer,
): Promise<PdfExtractionResult> {
  await ensureOfficialPdfModule();
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const extracted = await extractText(pdf, { mergePages: false });
  const pages = Array.from({ length: pdf.numPages }, (_, index) =>
    normalizeExtractedText(extracted.text[index] ?? ""),
  );
  const ocrLimit = getPdfOcrPageLimit();
  let ocrPageCount = 0;

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, ocrLimit); pageNumber += 1) {
    if (!needsPdfPageOcr(pages[pageNumber - 1])) continue;
    try {
      const rendered = await renderPageAsImage(pdf, pageNumber, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: 2,
      });
      if (typeof rendered === "string") continue;
      const pageText = await extractImageTextLocally(Buffer.from(rendered));
      if (pageText) {
        pages[pageNumber - 1] = pageText;
        ocrPageCount += 1;
      }
    } catch (error) {
      console.warn(
        `[Worker - Ingestion] OCR failed for PDF page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const extractedPageCount = pages.filter(Boolean).length;
  const missingPageCount = Math.max(pdf.numPages - extractedPageCount, 0);
  return {
    text: formatPdfPages(pages),
    status: missingPageCount === 0 ? "complete" : "partial",
    completeness: pdf.numPages ? extractedPageCount / pdf.numPages : 0,
    pageCount: pdf.numPages,
    extractedPageCount,
    ocrPageCount,
    missingPageCount,
  };
}

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("eng+vie", OEM.LSTM_ONLY, {
      cachePath: resolve(process.cwd(), ".cache", "tesseract"),
    }).then(async (worker) => {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: PSM.AUTO,
      });
      return worker;
    });
    ocrWorkerPromise.catch(() => {
      ocrWorkerPromise = null;
    });
  }
  return ocrWorkerPromise;
}

function ensureOfficialPdfModule() {
  pdfModulePromise ??= definePDFJSModule(() => import("pdfjs-dist"));
  return pdfModulePromise;
}

function getPdfOcrPageLimit() {
  const configured = Number(process.env.PDF_OCR_MAX_PAGES ?? 30);
  if (!Number.isFinite(configured)) return 30;
  return Math.min(Math.max(Math.trunc(configured), 1), 100);
}

function getPdfPageTextThreshold() {
  const configured = Number(process.env.PDF_PAGE_TEXT_MIN_CHARS ?? 20);
  if (!Number.isFinite(configured)) return 20;
  return Math.min(Math.max(Math.trunc(configured), 1), 500);
}

export function needsPdfPageOcr(
  text: string,
  minimumCharacters = getPdfPageTextThreshold(),
) {
  return normalizeExtractedText(text).length < minimumCharacters;
}

function formatPdfPages(pages: string[]) {
  return pages
    .map((text, index) => text ? `## Page ${index + 1}\n${text}` : "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
