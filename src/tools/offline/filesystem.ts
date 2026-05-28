import fs from "fs";
import path from "path";
import os from "os";
import type { ChatSessionModelFunctions } from "node-llama-cpp";

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
    description: "Create a new file at the given path with the given text content. Creates parent directories if needed.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path to the file to create" },
        content: { type: "string", description: "Text content to write into the file" },
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
    description: "Read and return the text content of a file at the given path.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path to the file to read" },
      },
      required: ["filePath"],
    } as const,
    handler({ filePath }: { filePath: string }): string {
      const resolved = safePath(filePath);
      if (!fs.existsSync(resolved)) return `Error: file not found at ${resolved}`;
      const stat = fs.statSync(resolved);
      if (stat.size > 100_000) return `Error: file too large to read (${stat.size} bytes). Max 100KB.`;
      return fs.readFileSync(resolved, "utf-8");
    },
  },

  listDirectory: {
    description: "List files and folders inside a directory.",
    params: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "Absolute or ~ path to the directory" },
      },
      required: ["dirPath"],
    } as const,
    handler({ dirPath }: { dirPath: string }): string {
      const resolved = safePath(dirPath);
      if (!fs.existsSync(resolved)) return `Error: directory not found at ${resolved}`;
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      if (entries.length === 0) return "(empty directory)";
      return entries
        .map((e) => `${e.isDirectory() ? "[dir] " : "[file]"} ${e.name}`)
        .join("\n");
    },
  },

  deleteFile: {
    description: "Delete a file at the given path. Does not delete directories.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path to the file to delete" },
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
    description: "Append text content to the end of an existing file.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path to the file" },
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
    description: "Move or rename a file from one path to another.",
    params: {
      type: "object",
      properties: {
        sourcePath: { type: "string", description: "Current file path" },
        destPath: { type: "string", description: "Destination file path" },
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
    description: "Copy a file from one path to another.",
    params: {
      type: "object",
      properties: {
        sourcePath: { type: "string", description: "Source file path" },
        destPath: { type: "string", description: "Destination file path" },
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
    description: "Create a directory (and any missing parent directories).",
    params: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "Path of the directory to create" },
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
    description: "Get metadata about a file: size, created date, last modified date.",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path to the file" },
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
    description: "Search for files by name inside a directory. Supports partial name matching.",
    params: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "Directory to search in" },
        pattern: { type: "string", description: "Filename pattern to match (case-insensitive substring)" },
        maxResults: { type: "number", description: "Max number of results (default 20)" },
      },
      required: ["dirPath", "pattern"],
    } as const,
    handler({ dirPath, pattern, maxResults }: { dirPath: string; pattern: string; maxResults?: number }): string {
      const resolved = safePath(dirPath);
      if (!fs.existsSync(resolved)) return `Error: directory not found at ${resolved}`;
      const limit = maxResults ?? 20;
      const results: string[] = [];
      const lower = pattern.toLowerCase();

      function walk(dir: string): void {
        if (results.length >= limit) return;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          if (results.length >= limit) break;
          const full = path.join(dir, entry.name);
          if (entry.name.toLowerCase().includes(lower)) results.push(full);
          if (entry.isDirectory() && !entry.name.startsWith(".")) walk(full);
        }
      }

      walk(resolved);
      return results.length ? results.join("\n") : `No files matching "${pattern}" found in ${resolved}`;
    },
  },
} satisfies ChatSessionModelFunctions;
