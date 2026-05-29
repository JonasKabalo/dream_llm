import fs from "fs";
import path from "path";
import os from "os";

const CREDS_DIR = path.join(os.homedir(), ".dream");
const CREDS_FILE = path.join(CREDS_DIR, "credentials.json");

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

export interface Credentials {
  github?: GithubCredentials;
  gmail?: GmailCredentials;
}

export function loadCredentials(): Credentials {
  if (!fs.existsSync(CREDS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CREDS_FILE, "utf-8")) as Credentials;
  } catch {
    return {};
  }
}

export function saveCredentials(update: Partial<Credentials>): void {
  fs.mkdirSync(CREDS_DIR, { recursive: true });
  const existing = loadCredentials();
  const merged = { ...existing, ...update };
  fs.writeFileSync(CREDS_FILE, JSON.stringify(merged, null, 2), "utf-8");
}

export function getGithubCreds(): GithubCredentials {
  const creds = loadCredentials();
  if (!creds.github) throw new Error("GitHub not set up. Run: npm run setup-github");
  return creds.github;
}

export function getGmailCreds(): GmailCredentials {
  const creds = loadCredentials();
  if (!creds.gmail) throw new Error("Gmail not set up. Run: npm run setup-gmail");
  return creds.gmail;
}
