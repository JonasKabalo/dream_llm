import fs from "fs";
import path from "path";
import os from "os";
import type { ChatSessionModelFunctions } from "node-llama-cpp";

const NOTES_DIR = path.join(os.homedir(), ".dream-notes");

function ensureNotesDir(): void {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
}

function noteFile(title: string): string {
  const safe = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-");
  return path.join(NOTES_DIR, `${safe}.md`);
}

export const notesTools = {
  createNote: {
    description: "Create or overwrite a note in ~/.dream-notes/.",
    params: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
        content: { type: "string", description: "Note content" },
      },
      required: ["title", "content"],
    } as const,
    handler({ title, content }: { title: string; content: string }): string {
      ensureNotesDir();
      const file = noteFile(title);
      const body = `# ${title}\n\n${content}\n\n_Created: ${new Date().toLocaleString()}_\n`;
      fs.writeFileSync(file, body, "utf-8");
      return `Note saved: ${file}`;
    },
  },

  listNotes: {
    description: "List all saved notes with last-modified dates.",
    params: { type: "object", properties: {} } as const,
    handler(): string {
      ensureNotesDir();
      const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith(".md"));
      if (!files.length) return "No notes yet.";
      return files
        .map((f) => {
          const stat = fs.statSync(path.join(NOTES_DIR, f));
          const title = f.replace(/\.md$/, "").replace(/-/g, " ");
          return `• ${title}  (modified: ${stat.mtime.toLocaleDateString()})`;
        })
        .join("\n");
    },
  },

  readNote: {
    description: "Read a note's content by title.",
    params: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
      },
      required: ["title"],
    } as const,
    handler({ title }: { title: string }): string {
      ensureNotesDir();
      const file = noteFile(title);
      if (!fs.existsSync(file)) return `Note not found: "${title}". Use listNotes to see all notes.`;
      return fs.readFileSync(file, "utf-8");
    },
  },

  deleteNote: {
    description: "Delete a note by title.",
    params: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
      },
      required: ["title"],
    } as const,
    handler({ title }: { title: string }): string {
      ensureNotesDir();
      const file = noteFile(title);
      if (!fs.existsSync(file)) return `Note not found: "${title}".`;
      fs.unlinkSync(file);
      return `Deleted note: "${title}"`;
    },
  },

  searchNotes: {
    description: "Search note contents for a keyword.",
    params: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to find" },
      },
      required: ["query"],
    } as const,
    handler({ query }: { query: string }): string {
      ensureNotesDir();
      const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith(".md"));
      const lower = query.toLowerCase();
      const matches: string[] = [];

      for (const f of files) {
        const content = fs.readFileSync(path.join(NOTES_DIR, f), "utf-8");
        if (content.toLowerCase().includes(lower)) {
          const title = f.replace(/\.md$/, "").replace(/-/g, " ");
          const line = content.split("\n").find((l) => l.toLowerCase().includes(lower)) ?? "";
          matches.push(`• ${title}: "${line.trim()}"`);
        }
      }

      return matches.length ? matches.join("\n") : `No notes contain "${query}".`;
    },
  },
} satisfies ChatSessionModelFunctions;
