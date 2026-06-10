import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { filesystemTools } from "../src/tools/offline/filesystem.js";

type Handler = (p: Record<string, unknown>) => string | Promise<string>;
const call = (name: keyof typeof filesystemTools, params: Record<string, unknown>): string | Promise<string> =>
  (filesystemTools[name].handler as Handler)(params);

let dir: string;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-fs-test-"));
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test("createFile / readFile / appendToFile roundtrip", async () => {
  const file = path.join(dir, "a.txt");
  assert.match(call("createFile", { filePath: file, content: "hello" }) as string, /Created/);
  assert.equal(await call("readFile", { filePath: file }), "hello");
  assert.match(call("appendToFile", { filePath: file, content: " world" }) as string, /Appended/);
  assert.equal(await call("readFile", { filePath: file }), "hello world");
});

test("editFile replaces text and reports counts", async () => {
  const file = path.join(dir, "edit.txt");
  call("createFile", { filePath: file, content: "foo bar foo" });
  assert.match(call("editFile", { filePath: file, find: "foo", replace: "baz" }) as string, /Replaced 2 occurrences/);
  assert.equal(await call("readFile", { filePath: file }), "baz bar baz");
  assert.match(call("editFile", { filePath: file, find: "missing", replace: "x" }) as string, /not found/);
});

test("moveFile and copyFile", async () => {
  const src = path.join(dir, "src.txt");
  call("createFile", { filePath: src, content: "data" });

  const moved = path.join(dir, "sub", "moved.txt");
  assert.match(call("moveFile", { sourcePath: src, destPath: moved }) as string, /Moved/);
  assert.ok(!fs.existsSync(src));

  const copy = path.join(dir, "copy.txt");
  assert.match(call("copyFile", { sourcePath: moved, destPath: copy }) as string, /Copied/);
  assert.equal(await call("readFile", { filePath: copy }), "data");
});

test("listDirectory shows entries and flags directories", () => {
  const out = call("listDirectory", { dirPath: dir }) as string;
  assert.match(out, /\[dir\] {2}sub/);
  assert.match(out, /\[file\] copy\.txt/);
});

test("getFileInfo returns parseable JSON metadata", () => {
  const info = JSON.parse(call("getFileInfo", { filePath: path.join(dir, "copy.txt") }) as string) as { type: string; size: string };
  assert.equal(info.type, "file");
  assert.match(info.size, /KB|MB/);
});

test("searchFiles finds by substring, respects miss", () => {
  assert.match(call("searchFiles", { dirPath: dir, pattern: "moved" }) as string, /moved\.txt/);
  assert.match(call("searchFiles", { dirPath: dir, pattern: "zzz-none" }) as string, /No files matching/);
});

test("deleteFile removes files but refuses directories", () => {
  assert.match(call("deleteFile", { filePath: path.join(dir, "copy.txt") }) as string, /Deleted/);
  assert.match(call("deleteFile", { filePath: path.join(dir, "sub") }) as string, /is a directory/);
});

test("protected system paths are refused", async () => {
  assert.throws(() => call("createFile", { filePath: "/etc/dream-test.txt", content: "x" }), /Access denied/);
  await assert.rejects(call("readFile", { filePath: "/etc/hosts" }) as Promise<string>, /Access denied/);
});

test("missing files yield error strings, not throws", async () => {
  assert.match(await call("readFile", { filePath: path.join(dir, "ghost.txt") }) as string, /not found/);
  assert.match(call("deleteFile", { filePath: path.join(dir, "ghost.txt") }) as string, /not found/);
});

test("checkCV reports CV status as a string either way", () => {
  const out = call("checkCV", {}) as string;
  assert.equal(typeof out, "string");
  assert.match(out, /CV/);
});
