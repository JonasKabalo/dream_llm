import fs from "fs";
import path from "path";
import os from "os";
import { DreamModel, type ChatMeta } from "./model.js";
import { allTools } from "./tools/index.js";

const WELL_KNOWN: Record<string, string> = {
  desktop:   path.join(os.homedir(), "Desktop"),
  downloads: path.join(os.homedir(), "Downloads"),
  documents: path.join(os.homedir(), "Documents"),
  pictures:  path.join(os.homedir(), "Pictures"),
  movies:    path.join(os.homedir(), "Movies"),
  music:     path.join(os.homedir(), "Music"),
  home:      os.homedir(),
};

// Resolve which directory the user wants to list, or null if the message
// isn't a listing request. Handles:
//   "ls" / "list files" → cwd
//   "ls in dream" / "list the src folder" → cwd/dream, cwd/src
//   "ls in the Desktop" → ~/Desktop
//   "ls ~/Downloads" / "ls /tmp" → absolute paths
function resolveListingTarget(msg: string): string | null {
  if (!/\b(ls|list\b|show\s+me\s+the|what.{0,20}(in|inside))/i.test(msg)) return null;

  // Explicit ~/path or /absolute/path
  const absMatch = msg.match(/(~\/[\w.\-/]+|\/[\w.\-/]+)/);
  if (absMatch) {
    const resolved = absMatch[1].replace(/^~/, os.homedir());
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
  }

  // "in X" / "in the X dir" — X is a directory name
  const inMatch = msg.match(/\bin\s+(?:the\s+)?["'`]?([\w.\-]+)["'`]?(?:\s+(?:dir(?:ectory)?|folder))?/i);
  if (inMatch) {
    const name = inMatch[1].toLowerCase();

    // Well-known macOS directories (case-insensitive)
    if (WELL_KNOWN[name]) return WELL_KNOWN[name];

    // Relative to cwd
    const resolved = path.resolve(process.cwd(), inMatch[1]);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
  }

  // No specific path → current directory
  return process.cwd();
}

function buildListingContext(msg: string): string | null {
  const target = resolveListingTarget(msg);
  if (!target) return null;
  try {
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const lines = entries.map((e) => `${e.isDirectory() ? "[dir] " : "[file]"} ${e.name}`).join("\n");
    return `[Actual directory listing for ${target}:\n${lines}]`;
  } catch {
    return null;
  }
}

export class Agent {
  private model: DreamModel;

  constructor(model: DreamModel) {
    this.model = model;
  }

  async warmup(): Promise<void> {
    // Prefill system prompt + tool descriptions into the KV cache by running
    // a minimal prompt. maxTokens:1 means almost no generation time — we only
    // care about the prefill so the first real user message hits a warm cache.
    try {
      await this.model.chat("Hi", allTools, undefined, 1);
    } catch {
      // non-fatal — worst case the first message is still slow
    }
  }

  async respond(userMessage: string, onChunk?: (token: string) => void): Promise<ChatMeta> {
    let message = userMessage;

    const listing = buildListingContext(message);
    if (listing) message += `\n\n${listing}`;

    return this.model.chat(message, allTools, onChunk);
  }
}
