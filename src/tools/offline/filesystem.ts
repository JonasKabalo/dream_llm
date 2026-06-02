import fs from "fs";
import path from "path";
import os from "os";
import { PDFParse } from "pdf-parse";
import type { ChatSessionModelFunctions } from "node-llama-cpp";
import { getCurrentCwd } from "./terminal.js";
import { CV_PATH } from "../../config.js";

const HOME = os.homedir();

function safePath(rawPath: string): string {
  const resolved = path.resolve(rawPath.replace(/^~/, HOME));
  if (
    resolved.startsWith("/System") ||
    resolved.startsWith("/usr") ||
    resolved.startsWith("/bin") ||
    resolved.startsWith("/sbin") ||
    resolved.startsWith("/etc")
  ) {
    throw new Error(`Access denied: ${resolved} is a protected system path.`);
  }
  return resolved;
}

export const filesystemTools = {
  createFile: {
    description: "Create a file with text content. Makes parent dirs if needed.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path" },
        content: { type: "string", description: "Text to write" },
      },
      required: ["filePath", "content"],
    } as const,
    handler({ filePath, content }: { filePath: string; content: string }): string {
      const resolved = safePath(filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, "utf-8");
      return `Created: ${resolved}`;
    },
  },

  readFile: {
    description: "Read a file's text content. Supports plain text and PDF files.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path" },
      },
      required: ["filePath"],
    } as const,
    async handler({ filePath }: { filePath: string }): Promise<string> {
      const resolved = safePath(filePath);
      if (!fs.existsSync(resolved)) return `Error: file not found at ${resolved}`;
      const stat = fs.statSync(resolved);

      if (resolved.toLowerCase().endsWith(".pdf")) {
        if (stat.size > 10 * 1024 * 1024) return `Error: PDF too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`;
        const buf = fs.readFileSync(resolved);
        const parser = new PDFParse({ data: new Uint8Array(buf) });
        try {
          const result = await parser.getText();
          const text = result.text.trim();
          return text || "(no text content found in PDF)";
        } finally {
          await parser.destroy().catch(() => {});
        }
      }

      if (stat.size > 100_000) return `Error: file too large to read (${stat.size} bytes). Max 100KB.`;
      return fs.readFileSync(resolved, "utf-8");
    },
  },

  listDirectory: {
    description: "List files and folders in a directory. Omit dirPath to list the current working directory (equivalent to running 'ls').",
    params: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "Absolute or ~ path. Omit to use the current directory." },
      },
    } as const,
    handler({ dirPath }: { dirPath?: string }): string {
      const resolved = dirPath ? safePath(dirPath) : getCurrentCwd();
      if (!fs.existsSync(resolved)) return `Error: directory not found at ${resolved}`;
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      if (entries.length === 0) return `(empty directory: ${resolved})`;
      const lines = entries.map((e) => `${e.isDirectory() ? "[dir] " : "[file]"} ${e.name}`);
      return `Contents of ${resolved}:\n${lines.join("\n")}`;
    },
  },

  deleteFile: {
    description: "Delete a file (not a directory).",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path" },
      },
      required: ["filePath"],
    } as const,
    handler({ filePath }: { filePath: string }): string {
      const resolved = safePath(filePath);
      if (!fs.existsSync(resolved)) return `Error: file not found at ${resolved}`;
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) return `Error: ${resolved} is a directory, not a file.`;
      fs.unlinkSync(resolved);
      return `Deleted: ${resolved}`;
    },
  },

  appendToFile: {
    description: "Append text to the end of a file.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path" },
        content: { type: "string", description: "Text to append" },
      },
      required: ["filePath", "content"],
    } as const,
    handler({ filePath, content }: { filePath: string; content: string }): string {
      const resolved = safePath(filePath);
      if (!fs.existsSync(resolved)) return `Error: file not found at ${resolved}`;
      fs.appendFileSync(resolved, content, "utf-8");
      return `Appended to: ${resolved}`;
    },
  },

  moveFile: {
    description: "Move or rename a file.",
    params: {
      type: "object",
      properties: {
        sourcePath: { type: "string", description: "Current path" },
        destPath: { type: "string", description: "New path" },
      },
      required: ["sourcePath", "destPath"],
    } as const,
    handler({ sourcePath, destPath }: { sourcePath: string; destPath: string }): string {
      const src = safePath(sourcePath);
      const dst = safePath(destPath);
      if (!fs.existsSync(src)) return `Error: file not found at ${src}`;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.renameSync(src, dst);
      return `Moved: ${src} → ${dst}`;
    },
  },

  copyFile: {
    description: "Copy a file to a new location.",
    params: {
      type: "object",
      properties: {
        sourcePath: { type: "string", description: "Source path" },
        destPath: { type: "string", description: "Destination path" },
      },
      required: ["sourcePath", "destPath"],
    } as const,
    handler({ sourcePath, destPath }: { sourcePath: string; destPath: string }): string {
      const src = safePath(sourcePath);
      const dst = safePath(destPath);
      if (!fs.existsSync(src)) return `Error: file not found at ${src}`;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      return `Copied: ${src} → ${dst}`;
    },
  },

  createDirectory: {
    description: "Create a directory and any missing parents.",
    params: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "Absolute or ~ path" },
      },
      required: ["dirPath"],
    } as const,
    handler({ dirPath }: { dirPath: string }): string {
      const resolved = safePath(dirPath);
      fs.mkdirSync(resolved, { recursive: true });
      return `Created directory: ${resolved}`;
    },
  },

  getFileInfo: {
    description: "Get file metadata: size, created, modified.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path" },
      },
      required: ["filePath"],
    } as const,
    handler({ filePath }: { filePath: string }): string {
      const resolved = safePath(filePath);
      if (!fs.existsSync(resolved)) return `Error: not found at ${resolved}`;
      const s = fs.statSync(resolved);
      const kb = (s.size / 1024).toFixed(1);
      const mb = (s.size / 1024 / 1024).toFixed(2);
      return JSON.stringify({
        path: resolved,
        type: s.isDirectory() ? "directory" : "file",
        size: s.size < 1024 * 1024 ? `${kb} KB` : `${mb} MB`,
        created: s.birthtime.toLocaleString(),
        modified: s.mtime.toLocaleString(),
      });
    },
  },

  searchFiles: {
    description: "Find files by name inside a directory (case-insensitive substring match). Max depth 5, stops after 5 seconds. Does NOT search for CV/resume files — use checkCV for that.",
    params: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "Directory to search" },
        pattern: { type: "string", description: "Substring to match against filenames" },
        maxResults: { type: "number", description: "Max results (default 20)" },
      },
      required: ["dirPath", "pattern"],
    } as const,
    handler({ dirPath, pattern, maxResults }: { dirPath: string; pattern: string; maxResults?: number }): string {
      const resolved = safePath(dirPath);
      if (!fs.existsSync(resolved)) return `Error: directory not found at ${resolved}`;
      const limit = maxResults ?? 20;
      const results: string[] = [];
      const lower = pattern.toLowerCase();
      const deadline = Date.now() + 5_000;
      const SKIP = new Set(["node_modules", "Library", "System", "Applications", "dist", "build", ".git", ".cache", ".npm", ".yarn", ".pnpm-store"]);

      function walk(dir: string, depth: number): void {
        if (results.length >= limit || Date.now() > deadline || depth > 5) return;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          if (results.length >= limit || Date.now() > deadline) break;
          const full = path.join(dir, entry.name);
          if (entry.name.toLowerCase().includes(lower)) results.push(full);
          if (entry.isDirectory() && !entry.name.startsWith(".") && !SKIP.has(entry.name)) {
            walk(full, depth + 1);
          }
        }
      }

      walk(resolved, 0);
      const timedOut = Date.now() > deadline;
      if (results.length === 0) return `No files matching "${pattern}" found in ${resolved}${timedOut ? " (search timed out)" : ""}`;
      return results.join("\n") + (timedOut ? "\n(search timed out — results may be incomplete)" : "");
    },
  },

  editFile: {
    description: "Find and replace text inside a file. Use to change specific content without rewriting the whole file.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path to the file" },
        find: { type: "string", description: "Exact text to find" },
        replace: { type: "string", description: "Text to replace it with" },
        replaceAll: { type: "boolean", description: "Replace every occurrence (true) or just the first (false). Default true." },
      },
      required: ["filePath", "find", "replace"],
    } as const,
    handler({ filePath, find, replace, replaceAll }: {
      filePath: string; find: string; replace: string; replaceAll?: boolean;
    }): string {
      const resolved = safePath(filePath);
      if (!fs.existsSync(resolved)) return `Error: file not found at ${resolved}`;
      const stat = fs.statSync(resolved);
      if (stat.size > 500_000) return `Error: file too large to edit (${(stat.size / 1024).toFixed(0)} KB). Max 500KB.`;

      const original = fs.readFileSync(resolved, "utf-8");
      if (!original.includes(find)) return `Error: text not found in ${resolved}:\n"${find}"`;

      const all = replaceAll ?? true;
      const updated = all
        ? original.split(find).join(replace)
        : original.replace(find, replace);

      const count = all
        ? (original.split(find).length - 1)
        : 1;

      fs.writeFileSync(resolved, updated, "utf-8");
      return `Replaced ${count} occurrence${count !== 1 ? "s" : ""} in ${resolved}`;
    },
  },

  importCV: {
    description: "Copy a CV/resume file from any local path into ~/.dream/cv.pdf so it can be attached to emails. Call this when the user wants to set up or update their CV, or when attachCv is needed but no CV is stored yet.",
    params: {
      type: "object",
      properties: {
        sourcePath: { type: "string", description: "Absolute or ~ path to the CV file (PDF, DOCX, etc.)" },
      },
      required: ["sourcePath"],
    } as const,
    handler({ sourcePath }: { sourcePath: string }): string {
      const src = safePath(sourcePath);
      if (!fs.existsSync(src)) return `Error: file not found at ${src}`;
      const stat = fs.statSync(src);
      if (stat.isDirectory()) return `Error: ${src} is a directory, not a file.`;
      if (stat.size > 10 * 1024 * 1024) return `Error: file is too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Max 10MB.`;
      fs.mkdirSync(path.dirname(CV_PATH), { recursive: true });
      fs.copyFileSync(src, CV_PATH);
      const kb = (stat.size / 1024).toFixed(1);
      return `CV saved to ${CV_PATH} (${kb} KB). It will be attached to emails when attachCv is true.`;
    },
  },

  checkCV: {
    description: "Check whether a CV is stored and ready to attach to emails.",
    params: { type: "object", properties: {} } as const,
    handler(): string {
      if (!fs.existsSync(CV_PATH)) {
        return `No CV found at ${CV_PATH}. Ask the user for their CV file path and call importCV to set it up.`;
      }
      const stat = fs.statSync(CV_PATH);
      const kb = (stat.size / 1024).toFixed(1);
      return `CV ready at ${CV_PATH} (${kb} KB, last modified ${stat.mtime.toLocaleDateString()}).`;
    },
  },
} satisfies ChatSessionModelFunctions;
