import test from "node:test";
import assert from "node:assert/strict";
import { needsPdfPageOcr } from "./local-document-extraction";

test("PDF OCR is selected per page instead of from whole-document text", () => {
  assert.equal(needsPdfPageOcr("", 20), true);
  assert.equal(needsPdfPageOcr("scanned page", 20), true);
  assert.equal(
    needsPdfPageOcr("This page already contains enough embedded PDF text.", 20),
    false,
  );
});
