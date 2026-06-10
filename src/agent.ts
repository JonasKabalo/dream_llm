import fs from "fs";
import path from "path";
import os from "os";
import type { ChatSessionModelFunctions } from "node-llama-cpp";
import { DreamModel, type ChatMeta } from "./model.js";
import { allTools } from "./tools/index.js";
import { getCurrentCwd } from "./tools/offline/terminal.js";

export interface ToolEvent {
  type: "start" | "end";
  name: string;
}

const WELL_KNOWN: Record<string, string> = {
  desktop:   path.join(os.homedir(), "Desktop"),
  downloads: path.join(os.homedir(), "Downloads"),
  documents: path.join(os.homedir(), "Documents"),
  pictures:  path.join(os.homedir(), "Pictures"),
  movies:    path.join(os.homedir(), "Movies"),
  music:     path.join(os.homedir(), "Music"),
  home:      os.homedir(),
};

// Filesystem vocabulary that must appear before we treat a message as a
// listing request. Without this gate, phrases like "show me the last email" or
// "list my unread emails" had a directory listing injected into the prompt,
// derailing the model on questions that have nothing to do with files.
const FS_VOCAB = /\b(files?|folders?|director(?:y|ies)|dir|desktop|downloads|documents|pictures|movies|music)\b/i;

// Resolve which directory the user wants to list, or null if the message
// isn't a listing request. Handles:
//   "ls" / "list files" → cwd
//   "ls in dream" / "list the src folder" → cwd/dream, cwd/src
//   "ls in the Desktop" → ~/Desktop
//   "ls ~/Downloads" / "ls /tmp" → absolute paths
// Exported for tests.
export function resolveListingTarget(msg: string): string | null {
  // "run ls", "execute ls", etc. → let the model use runTerminalCommand instead
  if (/\b(run|execute|call)\b.{0,15}\bls\b/i.test(msg)) return null;
  const bareLs = /^\s*ls\b/i.test(msg);
  const listingPhrase =
    /\b(ls|list|show\s+me|what.{0,20}\b(in|inside)\b)/i.test(msg) && FS_VOCAB.test(msg);
  if (!bareLs && !listingPhrase) return null;

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

  // No specific path → terminal's tracked working directory
  return getCurrentCwd();
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

// Wrap every tool handler so the UI can show what's running ("Using
// listEmails…") while the model waits on a tool. The wrapped definitions
// serialize identically to allTools, so the warm KV cache stays valid.
function withToolEvents(onToolEvent: (ev: ToolEvent) => void): ChatSessionModelFunctions {
  return Object.fromEntries(
    Object.entries(allTools).map(([name, tool]) => [name, {
      ...tool,
      handler: async (params: Record<string, unknown>): Promise<unknown> => {
        onToolEvent({ type: "start", name });
        try {
          return await (tool.handler as (p: Record<string, unknown>) => unknown)(params);
        } finally {
          onToolEvent({ type: "end", name });
        }
      },
    }]),
  ) as ChatSessionModelFunctions;
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
    } finally {
      // Critical: drop the warmup turn from history. maxTokens:1 cuts a
      // thinking model off mid-`<think>`; leaving that unfinished thought in
      // the history derails every subsequent response (the model just emits
      // "<think>" and stops). The cached prefix survives the reset.
      this.model.resetConversation();
    }
  }

  async respond(
    userMessage: string,
    onChunk?: (token: string) => void,
    onToolEvent?: (ev: ToolEvent) => void,
  ): Promise<ChatMeta> {
    let message = userMessage;

    const listing = buildListingContext(message);
    if (listing) message += `\n\n${listing}`;

    const tools = onToolEvent ? withToolEvents(onToolEvent) : allTools;
    return this.model.chat(message, tools, onChunk);
  }
}
