import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBody } from "../src/tools/online/gmail.js";

const TO = "sarah.connor@example.com";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test("REGRESSION: mid-sentence 'sincerely' must not chop the body", () => {
  const body =
    "I sincerely enjoyed our conversation yesterday. I would love to move forward with the next interview round. Let me know what times work for you.";
  const out = formatBody(body, TO);
  assert.ok(out.includes("next interview round"), `body was chopped:\n${out}`);
  assert.ok(out.includes("what times work for you"), `body was chopped:\n${out}`);
});

test("model-written sign-off paragraph is stripped (no duplicate signature)", () => {
  const body = "Hi Sarah,\n\nThanks for the update — see you Monday.\n\nKind regards,\nJonas";
  const out = formatBody(body, TO);
  assert.equal(countOccurrences(out, "Kind regards"), 1, out);
  assert.ok(out.includes("see you Monday"), out);
});

test("sign-off written with single newlines is also stripped", () => {
  const body = "Thanks for the update — see you Monday.\nBest regards,\nJonas";
  const out = formatBody(body, TO);
  assert.ok(!out.includes("Best regards"), out);
  assert.equal(countOccurrences(out, "Kind regards"), 1, out);
});

test("French sign-off is stripped", () => {
  const body = "Bonjour Sarah,\n\nMerci pour votre retour.\n\nCordialement,\nJonas";
  const out = formatBody(body, TO);
  assert.ok(!out.includes("Cordialement"), out);
  assert.ok(out.includes("Merci pour votre retour"), out);
});

test("greeting is added when missing", () => {
  const out = formatBody("Quick update: the deploy is done.", TO);
  assert.ok(out.startsWith("Hi Sarah,"), out);
});

test("existing greeting is not duplicated (including 'Hey')", () => {
  const out = formatBody("Hey Sarah, quick update: the deploy is done.", TO);
  assert.ok(out.startsWith("Hey Sarah,"), out);
  assert.ok(!out.includes("Hi Sarah,"), out);
});

test("recipient in 'Name <addr>' form still yields a clean greeting", () => {
  const out = formatBody("Quick update.", "Sarah Connor <sarah.connor@example.com>");
  assert.ok(out.startsWith("Hi Sarah,"), out);
});

test("signature is appended exactly once and ends the email", () => {
  const out = formatBody("Just confirming Friday works.", TO);
  assert.match(out, /Kind regards,\n.+$/);
  assert.equal(countOccurrences(out, "Kind regards"), 1, out);
});

test("paragraphs are reflowed but kept separated", () => {
  const out = formatBody("First paragraph\nwith a wrapped line.\n\nSecond paragraph.", TO);
  assert.ok(out.includes("First paragraph with a wrapped line."), out);
  assert.ok(out.includes("\n\nSecond paragraph."), out);
});
