// Live smoke tests for the online tools. They run READ-ONLY calls with the
// real credentials when available, and skip cleanly when not (e.g. CI):
//   - weather: keyless API; skipped if the network is unreachable
//   - gmail / github: skipped when ~/.dream/credentials.json has no entry
//   - apollo: opt-in via DREAM_TEST_APOLLO=1 (API calls draw on plan quota)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCredentials } from "../src/credentials.js";
import { weatherTools } from "../src/tools/online/weather.js";
import { gmailTools } from "../src/tools/online/gmail.js";
import { githubTools } from "../src/tools/online/github.js";
import { apolloTools } from "../src/tools/online/apollo.js";

const creds = loadCredentials();

function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.message} ${String(e.cause ?? "")}` : String(e);
  return /(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed)/i.test(msg);
}

test("weather: live current conditions for Paris", { timeout: 30_000 }, async (t) => {
  try {
    const out = await weatherTools.getWeather.handler({ location: "Paris" });
    assert.match(out.location, /Paris/);
    assert.match(out.temperature, /°C$/);
    assert.match(out.condition, /\w/);
  } catch (e) {
    if (isNetworkError(e)) return t.skip("network unreachable");
    throw e;
  }
});

test("gmail: listEmails returns inbox metadata (read-only)", { timeout: 30_000, skip: !creds.gmail && "Gmail not set up" }, async (t) => {
  try {
    const out = await gmailTools.listEmails.handler({ maxResults: 2 });
    assert.ok(
      out === "No emails found." || /ID: \w+ {2}\| {2}From: /.test(out),
      `unexpected listEmails output: ${out.slice(0, 120)}`,
    );
  } catch (e) {
    if (isNetworkError(e)) return t.skip("network unreachable");
    if (e instanceof Error && /invalid_grant/i.test(e.message)) {
      assert.fail("Gmail auth expired again — run: dream setup-gmail (and keep the OAuth app in Production mode)");
    }
    throw e;
  }
});

test("gmail: getEmailStats returns exact account totals (read-only)", { timeout: 30_000, skip: !creds.gmail && "Gmail not set up" }, async (t) => {
  try {
    const out = await gmailTools.getEmailStats.handler();
    const total = Number(/Total emails in the account: (\d+)/.exec(out)?.[1]);
    assert.ok(Number.isFinite(total) && total > 0, `unexpected stats output: ${out}`);
    assert.match(out, /Email address: .+@.+/);
  } catch (e) {
    if (isNetworkError(e)) return t.skip("network unreachable");
    throw e;
  }
});

test("gmail: countEmails counts matches for a query (read-only)", { timeout: 60_000, skip: !creds.gmail && "Gmail not set up" }, async (t) => {
  try {
    const out = await gmailTools.countEmails.handler({ query: "is:sent" });
    assert.match(out, /^\d+ emails match|^More than \d+ emails match/, out);
  } catch (e) {
    if (isNetworkError(e)) return t.skip("network unreachable");
    throw e;
  }
});

test("gmail: readEmail fetches the most recent message body (read-only)", { timeout: 30_000, skip: !creds.gmail && "Gmail not set up" }, async (t) => {
  try {
    const list = await gmailTools.listEmails.handler({ maxResults: 1 });
    if (list === "No emails found.") return t.skip("inbox is empty");
    const id = /ID: (\w+)/.exec(list)?.[1];
    assert.ok(id, `could not parse an ID from: ${list.slice(0, 120)}`);
    const mail = await gmailTools.readEmail.handler({ id });
    assert.match(mail, /^From: /m);
    assert.match(mail, /^Subject: /m);
  } catch (e) {
    if (isNetworkError(e)) return t.skip("network unreachable");
    throw e;
  }
});

test("gmail: exportEmailsToCsv writes a complete CSV (read-only fetch, tmp file)", { timeout: 60_000, skip: !creds.gmail && "Gmail not set up" }, async (t) => {
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  const target = path.join(os.tmpdir(), `dream-export-test-${Date.now()}.csv`);
  try {
    const out = await gmailTools.exportEmailsToCsv.handler({ query: "in:inbox", filePath: target, maxEmails: 3 });
    assert.match(out, /Exported \d+ emails/, out);
    const csv = fs.readFileSync(target, "utf-8");
    const lines = csv.trim().split("\n");
    assert.equal(lines[0], "date,from,to,subject,gmail_link");
    assert.ok(lines.length >= 2, "expected at least one data row");
    assert.match(lines[1], /^"\d{4}-\d{2}-\d{2} /, "rows start with an ISO-ish date");
    assert.match(lines[1], /mail\.google\.com/, "rows carry a gmail link");
  } catch (e) {
    if (isNetworkError(e)) return t.skip("network unreachable");
    throw e;
  } finally {
    fs.rmSync(target, { force: true });
  }
});

test("github: listMyRepos returns repository lines (read-only)", { timeout: 30_000, skip: !creds.github && "GitHub not set up" }, async (t) => {
  try {
    const out = await githubTools.listMyRepos.handler({});
    assert.ok(out === "No repositories found." || /\[(public|private)\]/.test(out), out.slice(0, 120));
  } catch (e) {
    if (isNetworkError(e)) return t.skip("network unreachable");
    throw e;
  }
});

test("apollo: searchPeople (opt-in — draws on plan quota)", {
  timeout: 30_000,
  skip: process.env.DREAM_TEST_APOLLO !== "1" ? "set DREAM_TEST_APOLLO=1 to run" : !creds.apollo && "Apollo not set up",
}, async (t) => {
  try {
    const out = await apolloTools.searchPeople.handler({ company: "Anthropic", maxResults: 1 });
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0);
  } catch (e) {
    if (isNetworkError(e)) return t.skip("network unreachable");
    throw e;
  }
});
