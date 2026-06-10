import { test } from "node:test";
import assert from "node:assert/strict";
import { createStreamCleaner, cleanResponseText } from "../src/model.js";

// Feed text in pathological chunkings — the cleaner must behave identically
// regardless of where chunk boundaries fall.
function runChunked(text: string, chunkSize: number): string {
  let out = "";
  const cleaner = createStreamCleaner((s) => { out += s; });
  for (let i = 0; i < text.length; i += chunkSize) {
    cleaner.push(text.slice(i, i + chunkSize));
  }
  cleaner.flush();
  return out;
}

test("turn-leading whitespace is swallowed (thinking-model boundary)", () => {
  for (const size of [1, 3, 50]) {
    assert.equal(runChunked("\n\n\n\n\n\nYour last email is from LinkedIn.", size), "Your last email is from LinkedIn.");
  }
});

test("plain text passes through unchanged at any chunk size", () => {
  const text = "Hello! Your last email is from GitHub about a security alert.";
  for (const size of [1, 2, 3, 7, 1000]) {
    assert.equal(runChunked(text, size), text);
  }
});

test("[call: …] is removed even when split across many chunks", () => {
  const text = '[call: listEmails({"query": "in:inbox"})]';
  for (const size of [1, 4, 9]) {
    assert.equal(runChunked(text, size), "");
  }
});

test("[result: …] between real text is removed, surrounding text kept", () => {
  const text = 'Checking your inbox.\n\n[result: "ID: 123 | From: x@y.z"]\n\nYour last email is from x@y.z.';
  for (const size of [1, 5, 13]) {
    assert.equal(runChunked(text, size), "Checking your inbox.\n\nYour last email is from x@y.z.");
  }
});

test("||answer: marker is dropped, answer kept", () => {
  assert.equal(runChunked("||answer: Paris is the capital of France.", 3), "Paris is the capital of France.");
});

test("(Note: …) blocks are removed", () => {
  assert.equal(runChunked("Done. (Note: this is internal) All set.", 4), "Done. All set.");
});

test("legitimate brackets are NOT eaten", () => {
  const text = "Array literals look like [1, 2, 3] and citations like [2] survive.";
  assert.equal(runChunked(text, 5), text);
});

test("unterminated [result: at end of stream is dropped on flush", () => {
  assert.equal(runChunked("The answer is 4. [result: half-written junk", 6), "The answer is 4. ");
});

test("unterminated (Note: at end of stream is kept (may be real prose)", () => {
  const text = "One thing to flag (Note: the deadline moved";
  assert.equal(runChunked(text, 8), text);
});

test("cleanResponseText cleans a full hallucinated-tool-syntax response", () => {
  const raw = 'Let me check.\n\n[result: "auth error"]\n\nYour Gmail login has expired.';
  assert.equal(cleanResponseText(raw), "Let me check.\n\nYour Gmail login has expired.");
});

test("safety valve: very long unclosed marker is eventually released", () => {
  const text = "[Result " + "x".repeat(5000);
  const out = runChunked(text, 100);
  assert.ok(out.length >= 4000, "withheld text must be released, not swallowed");
});
