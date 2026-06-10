import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { loadCredentials, saveCredentials, getGmailCreds, getGithubCreds } from "../src/credentials.js";

let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-creds-test-"));
  process.env.DREAM_CONFIG_DIR = tmpDir; // credentials.ts resolves this lazily
});

after(() => {
  delete process.env.DREAM_CONFIG_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("loadCredentials returns {} when no file exists", () => {
  assert.deepEqual(loadCredentials(), {});
});

test("save + load roundtrip, merging sections without clobbering", () => {
  saveCredentials({ github: { token: "t0k3n", username: "jonas" } });
  saveCredentials({ apollo: { apiKey: "ap0ll0" } });

  const creds = loadCredentials();
  assert.equal(creds.github?.username, "jonas");
  assert.equal(creds.apollo?.apiKey, "ap0ll0");
  assert.equal(getGithubCreds().token, "t0k3n");
});

test("corrupt credentials file degrades to {} instead of crashing", () => {
  fs.writeFileSync(path.join(tmpDir, "credentials.json"), "{not json!!", "utf-8");
  assert.deepEqual(loadCredentials(), {});
});

test("missing gmail creds throw an error naming the setup command", () => {
  assert.throws(() => getGmailCreds(), /dream setup-gmail/);
});
