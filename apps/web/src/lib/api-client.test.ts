import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalFetch = globalThis.fetch;
const apiClientUrl = new URL("./api-client.ts", import.meta.url).href;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("createDiaryEntry sends the Supabase bearer token to the API", async () => {
  const { createDiaryEntry } = await import(apiClientUrl);
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;

    return new Response(
      JSON.stringify({
        id: "diary-1",
        title: "Title",
        content: "Content",
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-18T00:00:00.000Z",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await createDiaryEntry(
    { title: "Title", content: "Content" },
    "jwt-token",
  );

  expectUrl(capturedUrl, "/api/diary");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(
    (capturedInit?.headers as Record<string, string>).Authorization,
    "Bearer jwt-token",
  );
  assert.equal(
    capturedInit?.body,
    JSON.stringify({ title: "Title", content: "Content" }),
  );
  assert.equal(result.id, "diary-1");
});

test("getDiaryEntries throws the backend error message when fetch fails", async () => {
  const { getDiaryEntries } = await import(apiClientUrl);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(() => getDiaryEntries("bad-token"), /Unauthorized/);
});

test("getDiaryEntries requests a bounded cursor page", async () => {
  const { DEFAULT_DIARY_PAGE_SIZE, getDiaryEntries } = await import(
    apiClientUrl
  );
  let capturedUrl = "";

  globalThis.fetch = async (input) => {
    capturedUrl = String(input);
    return new Response(
      JSON.stringify({ entries: [], nextCursor: null, hasMore: false }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  await getDiaryEntries("jwt-token", { cursor: "next-page" });

  const url = new URL(capturedUrl);
  assert.equal(url.searchParams.get("limit"), String(DEFAULT_DIARY_PAGE_SIZE));
  assert.equal(url.searchParams.get("cursor"), "next-page");
});

test("getDiaryEntries sends the selected timeline day to the server", async () => {
  const { getDiaryEntries } = await import(apiClientUrl);
  let capturedUrl = "";
  globalThis.fetch = async (input) => {
    capturedUrl = String(input);
    return new Response(
      JSON.stringify({ entries: [], nextCursor: null, hasMore: false }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  await getDiaryEntries("jwt-token", {
    startDate: new Date("2026-05-18T00:00:00.000Z"),
    endDate: "2026-05-18T23:59:59.999Z",
  });

  const url = new URL(capturedUrl);
  assert.equal(url.searchParams.get("startDate"), "2026-05-18T00:00:00.000Z");
  assert.equal(url.searchParams.get("endDate"), "2026-05-18T23:59:59.999Z");
});

test("getDiaryAttachmentContent downloads audio through the authenticated API", async () => {
  const { getDiaryAttachmentContent } = await import(apiClientUrl);
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(Buffer.from("mp3-bytes"), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  };

  const content = await getDiaryAttachmentContent("attachment-1", "jwt-token");

  expectUrl(capturedUrl, "/api/upload/attachment/attachment-1/content");
  assert.equal(capturedInit?.method, "GET");
  assert.equal(
    (capturedInit?.headers as Record<string, string>).Authorization,
    "Bearer jwt-token",
  );
  assert.equal((capturedInit?.headers as Record<string, string>).Accept, "*/*");
  assert.equal(content.type, "audio/mpeg");
  assert.equal(await content.text(), "mp3-bytes");
});

function expectUrl(actual: string, expectedPath: string) {
  const url = new URL(actual);
  assert.equal(url.pathname, expectedPath);
}
