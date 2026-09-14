import assert from "node:assert/strict";
import test from "node:test";
import { buildRelatedMemoryMap } from "./related-memory-score";
import type { TimelineEntry } from "./types";

function entry(
  id: string,
  overrides: Partial<TimelineEntry> = {},
): TimelineEntry {
  return {
    id,
    title: `Memory ${id}`,
    content: "A general diary memory.",
    createdAt: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

test("related memories prioritize shared tags over temporal proximity", () => {
  const entries = [
    entry("source", { tags: ["capstone"] }),
    entry("shared-tag", {
      tags: ["capstone"],
      createdAt: "2026-01-01T10:00:00.000Z",
    }),
    entry("nearby", { createdAt: "2026-08-21T10:00:00.000Z" }),
  ];

  const related = buildRelatedMemoryMap(entries).get("source") ?? [];

  assert.equal(related[0]?.entry.id, "shared-tag");
  assert.equal(related[0]?.reason, "Shared #capstone");
});

test("related memories use extracted attachment text as searchable context", () => {
  const entries = [
    entry("source", {
      content: "Planning the product launch presentation.",
    }),
    entry("attachment", {
      content: "Notes from a file.",
      attachments: [
        {
          id: "attachment-1",
          fileType: "application/pdf",
          fileName: "brief.pdf",
          extractionStatus: "extracted",
          extractedTextPreview: "Product launch presentation milestones",
          indexingStatus: "succeeded",
          createdAt: "2026-08-20T10:00:00.000Z",
        },
      ],
    }),
  ];

  const related = buildRelatedMemoryMap(entries).get("source") ?? [];

  assert.equal(related[0]?.entry.id, "attachment");
  assert.match(related[0]?.reason ?? "", /Similar theme/);
});

test("related-memory output stays bounded for a large common-theme timeline", () => {
  const entries = Array.from({ length: 1_000 }, (_, index) =>
    entry(`entry-${index}`, {
      title: `Capstone checkpoint ${index}`,
      content: "Reviewed retrieval performance and the shared project milestone.",
      tags: ["capstone"],
      createdAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    }),
  );

  const related = buildRelatedMemoryMap(entries);

  assert.equal(related.size, entries.length);
  for (const matches of related.values()) {
    assert.ok(matches.length <= 2);
  }
});
