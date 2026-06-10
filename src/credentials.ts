import fs from "fs";
import path from "path";
import os from "os";

// Resolved lazily so tests can point DREAM_CONFIG_DIR at a temp directory.
function credsDir(): string {
  return process.env.DREAM_CONFIG_DIR ?? path.join(os.homedir(), ".dream");
}

function credsFile(): string {
  return path.join(credsDir(), "credentials.json");
}

export interface GithubCredentials {
  token: string;
  username: string;
}

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  email: string;
  displayName: string;
}

export interface ApolloCredentials {
  apiKey: string;
}

export interface Credentials {
  github?: GithubCredentials;
  gmail?: GmailCredentials;
  apollo?: ApolloCredentials;
}

export function loadCredentials(): Credentials {
  if (!fs.existsSync(credsFile())) return {};
  try {
    return JSON.parse(fs.readFileSync(credsFile(), "utf-8")) as Credentials;
  } catch {
    return {};
  }
}

export function saveCredentials(update: Partial<Credentials>): void {
  fs.mkdirSync(credsDir(), { recursive: true });
  const existing = loadCredentials();
  const merged = { ...existing, ...update };
  fs.writeFileSync(credsFile(), JSON.stringify(merged, null, 2), "utf-8");
}

export function getGithubCreds(): GithubCredentials {
  const creds = loadCredentials();
  if (!creds.github) throw new Error('GitHub not set up. Run "dream setup-github" (or "npm run setup-github" when developing).');
  return creds.github;
}

export function getGmailCreds(): GmailCredentials {
  const creds = loadCredentials();
  if (!creds.gmail) throw new Error('Gmail not set up. Run "dream setup-gmail" (or "npm run setup-gmail" when developing).');
  return creds.gmail;
}

export function getApolloCreds(): ApolloCredentials {
  const creds = loadCredentials();
  if (!creds.apollo) throw new Error('Apollo not set up. Run "dream setup-apollo" (or "npm run setup-apollo" when developing).');
  return creds.apollo;
}
