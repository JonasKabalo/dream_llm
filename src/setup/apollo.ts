import readline from "readline";
import { saveCredentials } from "../credentials.js";

export async function run(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

  console.log("\n  Dream — Apollo.io Setup");
  console.log("  ─────────────────────────────────────");
  console.log("  You need an Apollo.io API key.\n");
  console.log("  1. Go to: https://app.apollo.io/#/settings/integrations/api");
  console.log("  2. Click 'Create new key' if you don't have one");
  console.log("  3. Copy the API key\n");

  const apiKey = (await ask("  Paste your API key here: ")).trim();
  rl.close();

  if (!apiKey) {
    console.error("No API key provided.");
    process.exit(1);
  }

  console.log("\n  Verifying API key...");

  const res = await fetch("https://api.apollo.io/api/v1/people/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, per_page: 1, page: 1 }),
  });

  if (!res.ok) {
    console.error(`  Error: ${res.status} — invalid API key or no network.`);
    process.exit(1);
  }

  saveCredentials({ apollo: { apiKey } });

  console.log("  Apollo.io API key verified and saved to ~/.dream/credentials.json");
  console.log("  You can now ask Dream to find emails and people at companies.\n");
}
