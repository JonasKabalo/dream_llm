import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatSessionModelFunctions } from "node-llama-cpp";
import { safe } from "../src/tools/index.js";

const dummy = {
  okSync: {
    description: "ok",
    params: { type: "object", properties: {} } as const,
    handler: (): string => "fine",
  },
  okAsync: {
    description: "ok",
    params: { type: "object", properties: {} } as const,
    handler: async (): Promise<string> => "fine async",
  },
  throwsSync: {
    description: "boom",
    params: { type: "object", properties: {} } as const,
    handler: (): string => { throw new Error("kaboom"); },
  },
  rejectsAsync: {
    description: "boom",
    params: { type: "object", properties: {} } as const,
    handler: async (): Promise<string> => { throw new Error("async kaboom"); },
  },
  authExpired: {
    description: "gmail-ish",
    params: { type: "object", properties: {} } as const,
    handler: (): string => { throw new Error("invalid_grant"); },
  },
  offline: {
    description: "network",
    params: { type: "object", properties: {} } as const,
    handler: async (): Promise<string> => { throw new Error("fetch failed"); },
  },
} satisfies ChatSessionModelFunctions;

const wrapped = safe(dummy);
const call = (name: keyof typeof dummy): unknown =>
  (wrapped[name].handler as (p: Record<string, unknown>) => unknown)({});

test("successful handlers pass through", async () => {
  assert.equal(call("okSync"), "fine");
  assert.equal(await call("okAsync"), "fine async");
});

test("sync throw becomes an error string, not a crash", () => {
  assert.equal(call("throwsSync"), "Tool error in throwsSync: kaboom");
});

test("async rejection becomes an error string, not a crash", async () => {
  assert.equal(await call("rejectsAsync"), "Tool error in rejectsAsync: async kaboom");
});

test("invalid_grant maps to an actionable re-auth instruction", () => {
  const msg = String(call("authExpired"));
  assert.match(msg, /dream setup-gmail/);
  assert.match(msg, /expired|revoked/i);
});

test("network errors map to an actionable offline message", async () => {
  const msg = String(await call("offline"));
  assert.match(msg, /internet|network/i);
});
