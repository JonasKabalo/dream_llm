import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveListingTarget } from "../src/agent.js";

test("email questions must NOT trigger directory-listing injection", () => {
  const emailish = [
    "what's my last email about",
    "show me the last email",
    "what is the last email in my inbox",
    "list my unread emails",
    "show me my inbox",
    "send an email to sarah about the meeting",
  ];
  for (const msg of emailish) {
    assert.equal(resolveListingTarget(msg), null, `should not trigger: "${msg}"`);
  }
});

test("other non-file questions must NOT trigger either", () => {
  const other = [
    "show me the weather in Paris",
    "what's the time in Tokyo",
    "list my open pull requests",
    "show me my notes",
  ];
  for (const msg of other) {
    assert.equal(resolveListingTarget(msg), null, `should not trigger: "${msg}"`);
  }
});

test("genuine listing requests still trigger", () => {
  const listing = [
    "ls",
    "ls in dream",
    "list files",
    "list the files in src",
    "show me the files in this folder",
    "what's in my Downloads folder",
  ];
  for (const msg of listing) {
    assert.notEqual(resolveListingTarget(msg), null, `should trigger: "${msg}"`);
  }
});

test("'run ls' style requests are left to the terminal tool", () => {
  assert.equal(resolveListingTarget("run ls for me"), null);
  assert.equal(resolveListingTarget("execute ls -la"), null);
});

test("well-known folder names resolve to the right directory", () => {
  const target = resolveListingTarget("ls in the Desktop");
  assert.ok(target !== null && /Desktop$/.test(target), String(target));
});
