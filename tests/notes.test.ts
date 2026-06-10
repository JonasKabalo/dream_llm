import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { notesTools } from "../src/tools/offline/notes.js";

const call = (name: keyof typeof notesTools, params: Record<string, unknown> = {}): string =>
  (notesTools[name].handler as (p: Record<string, unknown>) => string)(params);

let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-notes-test-"));
  process.env.DREAM_NOTES_DIR = tmpDir; // notes.ts resolves this lazily
});

after(() => {
  delete process.env.DREAM_NOTES_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("create, list, read, search, delete a note", () => {
  assert.equal(call("listNotes"), "No notes yet.");

  const saved = call("createNote", { title: "Interview Ideas", content: "Ask about team rituals." });
  assert.match(saved, /Interview-Ideas\.md/);

  assert.match(call("listNotes"), /Interview Ideas/);
  assert.match(call("readNote", { title: "Interview Ideas" }), /team rituals/);
  assert.match(call("searchNotes", { query: "rituals" }), /Interview Ideas/);
  assert.equal(call("searchNotes", { query: "nonexistent-zzz" }), 'No notes contain "nonexistent-zzz".');

  assert.match(call("deleteNote", { title: "Interview Ideas" }), /Deleted/);
  assert.equal(call("listNotes"), "No notes yet.");
});

test("titles are sanitized into safe filenames", () => {
  call("createNote", { title: "weird/../title!!", content: "x" });
  const files = fs.readdirSync(tmpDir);
  assert.ok(files.every((f) => !f.includes("/") && !f.includes("..")), files.join(", "));
  for (const f of files) fs.rmSync(path.join(tmpDir, f));
});

test("reading a missing note returns a helpful message", () => {
  assert.match(call("readNote", { title: "Nope" }), /not found/i);
});
