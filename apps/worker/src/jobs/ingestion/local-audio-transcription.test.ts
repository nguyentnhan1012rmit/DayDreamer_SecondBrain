import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPcmDurationWithinLimit,
  float32ViewFromBuffer,
} from "./local-audio-transcription.ts";

test("local PCM preparation enforces the configured audio duration", () => {
  const twoSecondsOfPcmBytes = 2 * 16_000 * Float32Array.BYTES_PER_ELEMENT;
  assert.doesNotThrow(() =>
    assertPcmDurationWithinLimit(twoSecondsOfPcmBytes, 2),
  );
  assert.throws(
    () => assertPcmDurationWithinLimit(twoSecondsOfPcmBytes + 4, 2),
    /exceeds the 2 second local transcription limit/,
  );
});

test("local PCM preparation rejects malformed float32 output", () => {
  assert.throws(
    () => assertPcmDurationWithinLimit(3, 2),
    /invalid float32 PCM byte length/,
  );
});

test("aligned PCM buffers are exposed to Whisper without a full copy", () => {
  const samples = new Float32Array([0.25, -0.5, 1]);
  const buffer = Buffer.from(samples.buffer);
  const view = float32ViewFromBuffer(buffer);

  assert.strictEqual(view.buffer, buffer.buffer);
  assert.deepEqual([...view], [...samples]);
});
