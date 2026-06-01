import readline from "readline";
import http from "http";
import { execSync } from "child_process";
import { google } from "googleapis";
import { saveCredentials } from "../credentials.js";

export async function run(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

  console.log("\n  Dream — Gmail Setup");
  console.log("  ─────────────────────────────────────");
  console.log("  You need Google OAuth credentials. Here's how:\n");
  console.log("  1. Go to: https://console.cloud.google.com/");
  console.log("  2. Create a project (or select an existing one)");
  console.log("  3. Go to APIs & Services → Library → search 'Gmail API' → Enable");
  console.log("  4. Go to APIs & Services → Credentials → Create Credentials → OAuth client ID");
  console.log("  5. Application type: Desktop app — name it 'Dream'");
  console.log("  6. Copy the Client ID and Client Secret shown\n");

  const clientId = (await ask("  Client ID: ")).trim();
  const clientSecret = (await ask("  Client Secret: ")).trim();

  if (!clientId || !clientSecret) {
    console.error("Both fields are required.");
    rl.close();
    process.exit(1);
  }

  const REDIRECT_PORT = 8080;
  const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;
  const SCOPES = ["https://mail.google.com/"];

  const auth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = auth.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n  Opening your browser for Google authorization...");
  console.log("  (If it doesn't open, visit this URL manually:)");
  console.log(`  ${authUrl}\n`);

  try { execSync(`open "${authUrl}"`); } catch { /* browser open failed */ }

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get("code");
      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1 style='font-family:sans-serif;margin:40px'>✓ Dream authorized! You can close this tab.</h1>");
        server.close();
        resolve(code);
      } else {
        res.writeHead(400);
        res.end("Missing code");
        reject(new Error("No code in OAuth redirect"));
      }
    });

    server.listen(REDIRECT_PORT);
    console.log(`  Waiting for Google to redirect to localhost:${REDIRECT_PORT}...`);

    setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for authorization"));
    }, 120_000);
  });

  console.log("  Authorization received. Exchanging for tokens...");

  const { tokens } = await auth.getToken(code);

  if (!tokens.refresh_token) {
    console.error("  No refresh token received. Try revoking access at https://myaccount.google.com/permissions and run setup again.");
    rl.close();
    process.exit(1);
  }

  auth.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress ?? "";

  function suggestName(addr: string): string {
    const local = addr.split("@")[0];
    const cleaned = local.replace(/\d+/g, "");
    const parts = cleaned.split(/[.\-_]+/).filter(Boolean);
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  }

  const suggested = suggestName(email);
  console.log(`\n  Detected email: ${email}`);

  const input = (await ask(`  Your name for email signatures [${suggested}]: `)).trim();
  const displayName = input || suggested;
  rl.close();

  saveCredentials({
    gmail: {
      clientId,
      clientSecret,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ?? 0,
      email,
      displayName,
    },
  });

  console.log(`\n  Signature will be: "Kind regards, ${displayName}"`);
  console.log("  Gmail saved to ~/.dream/credentials.json");
  console.log("  You can now ask Dream to read, draft, and send emails.\n");
}
