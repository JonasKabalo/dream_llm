import readline from "readline";
import { saveCredentials } from "../credentials.js";

export async function run(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

  console.log("\n  Dream — GitHub Setup");
  console.log("  ─────────────────────────────────────");
  console.log("  You need a Personal Access Token (PAT).\n");
  console.log("  1. Go to: https://github.com/settings/tokens/new");
  console.log("  2. Name it 'Dream'");
  console.log("  3. Set expiration as you like");
  console.log("  4. Select scopes: repo, read:user");
  console.log("  5. Click 'Generate token' and copy it\n");

  const token = (await ask("  Paste your token here: ")).trim();
  rl.close();

  if (!token) {
    console.error("No token provided.");
    process.exit(1);
  }

  console.log("\n  Verifying token...");

  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "Dream-Assistant" },
  });

  if (!res.ok) {
    console.error(`  Error: ${res.status} — invalid token or no network.`);
    process.exit(1);
  }

  const user = await res.json() as { login: string; name: string };
  console.log(`  Authenticated as: ${user.name ?? user.login} (@${user.login})\n`);

  saveCredentials({ github: { token, username: user.login } });

  console.log("  GitHub saved to ~/.dream/credentials.json");
  console.log("  You can now ask Dream about your repos, PRs, and issues.\n");
}
