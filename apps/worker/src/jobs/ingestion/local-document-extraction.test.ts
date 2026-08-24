import assert from "node:assert/strict";
import test from "node:test";
import { supplementPdfPagesWithOcr } from "./local-document-extraction.ts";

test("mixed PDFs OCR scanned gaps and preserve original page numbers", async () => {
  const ocrPages: number[] = [];
  const result = await supplementPdfPagesWithOcr({
    textPages: [
      "Embedded text from the first page.",
      "",
      "Embedded text from the third page.",
      "",
    ],
    pageCount: 4,
    maxOcrPages: 2,
    minTextCharacters: 20,
    ocrPage: async (pageNumber) => {
      ocrPages.push(pageNumber);
      return `Scanned text from page ${pageNumber}.`;
    },
  });

  assert.deepEqual(ocrPages, [2, 4]);
  assert.match(result, /## Page 1\nEmbedded text from the first page\./);
  assert.match(result, /## Page 2\nScanned text from page 2\./);
  assert.match(result, /## Page 3\nEmbedded text from the third page\./);
  assert.match(result, /## Page 4\nScanned text from page 4\./);
});

test("PDF OCR supplements short embedded text on the same page", async () => {
  const result = await supplementPdfPagesWithOcr({
    textPages: ["Invoice"],
    pageCount: 1,
    maxOcrPages: 1,
    minTextCharacters: 20,
    ocrPage: async () => "Invoice total: $42.00",
  });

  assert.match(result, /## Page 1\nInvoice/);
  assert.match(result, /### OCR supplement\nInvoice total: \$42\.00/);
});

test("one failed PDF OCR page does not discard readable embedded pages", async () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;

  try {
    const result = await supplementPdfPagesWithOcr({
      textPages: ["", "Readable embedded content on page two."],
      pageCount: 2,
      maxOcrPages: 1,
      minTextCharacters: 20,
      ocrPage: async () => {
        throw new Error("renderer unavailable");
      },
    });

    assert.doesNotMatch(result, /## Page 1/);
    assert.match(
      result,
      /## Page 2\nReadable embedded content on page two\./,
    );
  } finally {
    console.warn = originalWarn;
  }
});
