import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { datetimeTools } from "../src/tools/offline/datetime.js";
import { dateutilsTools } from "../src/tools/offline/dateutils.js";
import { terminalTools, getCurrentCwd } from "../src/tools/offline/terminal.js";
import { systemTools } from "../src/tools/offline/system.js";
import { clipboardTools } from "../src/tools/offline/clipboard.js";
import { INPUT_ROWS, termRows, scrollEnd, inputTop } from "../src/layout.js";

// ── datetime ─────────────────────────────────────────────────────────────────

test("getCurrentDateTime returns a full shape", () => {
  const out = datetimeTools.getCurrentDateTime.handler({});
  assert.ok(out.date.length > 0);
  assert.ok(out.time.length > 0);
  assert.ok(out.timezone.length > 0);
  assert.ok(!Number.isNaN(Date.parse(out.iso)));
});

test("getCurrentDateTime converts timezones and survives bad ones", () => {
  const tokyo = datetimeTools.getCurrentDateTime.handler({ timezone: "Asia/Tokyo" });
  assert.equal(tokyo.timezone, "Asia/Tokyo");

  const bogus = datetimeTools.getCurrentDateTime.handler({ timezone: "Not/AZone" });
  assert.notEqual(bogus.timezone, "Not/AZone"); // falls back to local
});

// ── dateutils ────────────────────────────────────────────────────────────────

test("calculateDate adds and subtracts", () => {
  assert.match(dateutilsTools.calculateDate.handler({ baseDate: "2026-01-01", amount: 7, unit: "days" }), /2026-01-08/);
  assert.match(dateutilsTools.calculateDate.handler({ baseDate: "2026-03-15", amount: -1, unit: "months" }), /2026-02-15/);
  assert.match(dateutilsTools.calculateDate.handler({ baseDate: "2026-01-01", amount: 1, unit: "fortnights" }), /Unknown unit/);
});

test("dateDifference counts days and direction", () => {
  assert.match(dateutilsTools.dateDifference.handler({ from: "2026-01-01", to: "2026-01-08" }), /^7 days .*from now/);
  assert.match(dateutilsTools.dateDifference.handler({ from: "2026-01-08", to: "2026-01-01" }), /^7 days .*ago/);
});

// ── terminal (no command execution in tests — safety paths only) ─────────────

test("destructive commands are blocked before any confirmation or execution", () => {
  const blocked = [
    "rm -rf /",
    "rm -rf ~/",
    "sudo rm -rf /tmp/x",
    "rm -rf *",
    "chmod -R 777 /",
  ];
  for (const command of blocked) {
    const out = terminalTools.runTerminalCommand.handler({ command });
    assert.match(out, /Blocked/, `should block: ${command}`);
  }
});

test("missing working directory is rejected without executing", () => {
  const out = terminalTools.runTerminalCommand.handler({ command: "echo hi", cwd: "/nonexistent/dir/zzz" });
  assert.match(out, /does not exist/);
});

test("setWorkingDirectory validates and persists", () => {
  const original = getCurrentCwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dream-cwd-test-"));
  try {
    assert.match(terminalTools.setWorkingDirectory.handler({ dirPath: tmp }), /Working directory set/);
    assert.match(terminalTools.getWorkingDirectory.handler(), new RegExp(path.basename(tmp)));
    assert.match(terminalTools.setWorkingDirectory.handler({ dirPath: "/nonexistent/zzz" }), /does not exist/);
  } finally {
    terminalTools.setWorkingDirectory.handler({ dirPath: original });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── system ───────────────────────────────────────────────────────────────────

test("getSystemInfo returns parseable JSON with the expected keys", () => {
  const info = JSON.parse(systemTools.getSystemInfo.handler()) as Record<string, string>;
  for (const key of ["memory", "disk", "battery", "cpu_load", "uptime", "platform", "hostname"]) {
    assert.ok(key in info, `missing key: ${key}`);
  }
  assert.match(info.memory, /GB|MB/);
});

test("openFile refuses missing files without launching anything", () => {
  const out = systemTools.openFile.handler({ filePath: "/nonexistent/zzz.pdf" });
  assert.match(out, /not found/);
});

// ── clipboard (opt-in: mutates the user's clipboard) ─────────────────────────

test("clipboard roundtrip", { skip: process.platform !== "darwin" || process.env.DREAM_TEST_CLIPBOARD !== "1" }, () => {
  const previous = clipboardTools.getClipboard.handler();
  try {
    clipboardTools.setClipboard.handler({ text: "dream-test-content" });
    assert.match(clipboardTools.getClipboard.handler(), /dream-test-content/);
  } finally {
    clipboardTools.setClipboard.handler({ text: previous });
  }
});

// ── layout math ──────────────────────────────────────────────────────────────

test("layout zones are consistent and fit the terminal", () => {
  assert.equal(INPUT_ROWS, 6);
  assert.ok(termRows() >= 1);
  assert.equal(inputTop(), scrollEnd() + 1);
  assert.ok(scrollEnd() >= 1);

  // The input zone renderer uses at most INPUT_ROWS rows:
  // 1 top blank + (INPUT_ROWS - 3) content + 1 bottom blank + 1 status bar.
  const maxContentRows = Math.max(1, INPUT_ROWS - 3);
  assert.equal(1 + maxContentRows + 1 + 1, INPUT_ROWS);
});
