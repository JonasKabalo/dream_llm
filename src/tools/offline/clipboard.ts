import { execSync } from "child_process";
import type { ChatSessionModelFunctions } from "node-llama-cpp";

export const clipboardTools = {
  getClipboard: {
    description: "Read the current clipboard content.",
    params: { type: "object", properties: {} } as const,
    handler(): string {
      try {
        return execSync("pbpaste", { encoding: "utf-8" }).toString();
      } catch {
        return "Error: could not read clipboard.";
      }
    },
  },

  setClipboard: {
    description: "Copy text to the clipboard.",
    params: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to copy" },
      },
      required: ["text"],
    } as const,
    handler({ text }: { text: string }): string {
      try {
        execSync("pbcopy", { input: text });
        return `Copied to clipboard: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`;
      } catch {
        return "Error: could not write to clipboard.";
      }
    },
  },
} satisfies ChatSessionModelFunctions;
