import assert from "node:assert/strict";
import test from "node:test";
import {
  getLocalDateInputValue,
  getReflectionFallback,
  normalizeReflectionQuestion,
} from "./diary-utils.ts";

test("formats a date for the diary date input using local values", () => {
  const date = new Date(2026, 7, 24, 23, 30);
  assert.equal(getLocalDateInputValue(date), "2026-08-24");
});

test("normalizes an AI reflection into one concise question", () => {
  assert.equal(
    normalizeReflectionQuestion(
      "- What made this moment meaningful\nMore text",
      "Fallback?",
    ),
    "What made this moment meaningful?",
  );
});

test("uses the fallback when AI does not return a reflection", () => {
  const fallback = getReflectionFallback("bad");
  assert.equal(normalizeReflectionQuestion("  ", fallback), fallback);
});
