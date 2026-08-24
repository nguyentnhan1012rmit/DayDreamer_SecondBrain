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
  await ensureOfficialPdfModule();
  const pdfBytes = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const pdf = await getDocumentProxy(pdfBytes);
  const extracted = await extractText(pdf, { mergePages: false });
  return supplementPdfPagesWithOcr({
    textPages: extracted.text,
    pageCount: pdf.numPages,
    maxOcrPages: getPdfOcrPageLimit(),
    minTextCharacters: getPdfOcrMinTextCharacters(),
    ocrPage: async (pageNumber) => {
      const rendered = await renderPageAsImage(pdf, pageNumber, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: 2,
      });
      return extractImageTextLocally(Buffer.from(rendered));
    },
  });
}

export async function supplementPdfPagesWithOcr(input: {
  textPages: string[];
  pageCount: number;
  maxOcrPages: number;
  minTextCharacters: number;
  ocrPage: (pageNumber: number) => Promise<string>;
}) {
  const pages = Array.from({ length: input.pageCount }, (_, index) => ({
    pageNumber: index + 1,
    text: normalizeExtractedText(input.textPages[index] ?? ""),
  }));
  let attemptedOcrPages = 0;

  for (const page of pages) {
    if (page.text.length >= input.minTextCharacters) continue;
    if (attemptedOcrPages >= input.maxOcrPages) break;
    attemptedOcrPages += 1;

    try {
      const ocrText = normalizeExtractedText(
        await input.ocrPage(page.pageNumber),
      );
      page.text = mergePdfPageText(page.text, ocrText);
    } catch (error) {
      console.warn(
        `[PDF OCR] Page ${page.pageNumber} failed; preserving any embedded text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return formatPdfPages(pages);
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

function getPdfOcrMinTextCharacters() {
  const configured = Number(process.env.PDF_OCR_MIN_TEXT_CHARACTERS ?? 40);
  if (!Number.isFinite(configured)) return 40;
  return Math.min(Math.max(Math.trunc(configured), 1), 1_000);
}

function mergePdfPageText(embeddedText: string, ocrText: string) {
  if (!embeddedText) return ocrText;
  if (!ocrText || embeddedText === ocrText) return embeddedText;
  return `${embeddedText}\n\n### OCR supplement\n${ocrText}`;
}

function formatPdfPages(
  pages: Array<{ pageNumber: number; text: string }>,
) {
  return pages
    .filter((page) => page.text)
    .map((page) => `## Page ${page.pageNumber}\n${page.text}`)
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
