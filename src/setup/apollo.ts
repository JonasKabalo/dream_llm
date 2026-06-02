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

  const res = await fetch("https://api.apollo.io/api/v1/auth/health", {
    headers: { "X-Api-Key": apiKey },
  });

  if (!res.ok) {
    console.error(`  Error: ${res.status} — could not verify API key. Check it and try again.`);
    process.exit(1);
  }

  const health = await res.json() as { is_logged_in?: boolean };
  if (!health.is_logged_in) {
    console.error("  Error: API key is not valid.");
    process.exit(1);
  }

  saveCredentials({ apollo: { apiKey } });

  console.log("  API key verified and saved to ~/.dream/credentials.json");
  console.log("  Note: contact search requires a Basic+ Apollo plan.");
  console.log("  You can now ask Dream to find emails and contacts at companies.\n");
}
