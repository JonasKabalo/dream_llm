import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import chalk from "chalk";
import type { ChatSessionModelFunctions } from "node-llama-cpp";
const BLOCKED = [
  /rm\s+-rf\s+[/~]/,
  /rm\s+-rf\s+\*/,
  /sudo\s+rm/,
  /mkfs/,
  /dd\s+if=.*of=\/dev/,
  /:\(\)\{.*\|.*:.*\}/,
  /chmod\s+-R\s+777\s+\//,
];

// Remembered working directory — starts where the user launched Dream, persists for the session
let currentCwd: string = process.cwd();

function isBlocked(cmd: string): boolean {
  return BLOCKED.some((re) => re.test(cmd));
}

// Fix common model-generated command typos before they reach the shell
function sanitize(cmd: string): string {
  return cmd
    .replace(/^git add\.(?=\s|$)/m, "git add .")      // git add.  → git add .
    .replace(/^git add-A(?=\s|$)/m, "git add -A")      // git add-A → git add -A
    .replace(/\bls\s+--a\b/g, "ls -a")                 // ls --a    → ls -a
    .replace(/\bls\s+--la\b/g, "ls -la")               // ls --la   → ls -la
    .replace(/\bls\s+--l\b/g, "ls -l")                 // ls --l    → ls -l
    .trim();
}

function resolveCwd(raw: string): string {
  return path.resolve(raw.replace(/^~/, os.homedir()));
}

function askConfirm(command: string, cwd: string): boolean {
  process.stdout.write("\n");
  process.stdout.write("  " + chalk.yellow("⚠ ") + chalk.bold("Dream wants to run:\n"));
  process.stdout.write("  " + chalk.dim("$ ") + chalk.cyan(command) + "\n");
  process.stdout.write("  " + chalk.dim("in ") + chalk.dim.underline(cwd) + "\n");
  process.stdout.write("  " + chalk.dim("Confirm? [y/N] "));

  try {
    const tty = fs.openSync("/dev/tty", "r");
    const buf = Buffer.alloc(16);
    const n = fs.readSync(tty, buf, 0, 16, null);
    fs.closeSync(tty);
    const answer = buf.slice(0, n).toString().trim().toLowerCase();
    const confirmed = answer === "y" || answer === "yes";
    process.stdout.write(confirmed ? chalk.green("✓\n\n") : chalk.red("✗ Cancelled\n\n"));
    return confirmed;
  } catch {
    process.stdout.write(chalk.red("✗ Could not read confirmation\n\n"));
    return false;
  }
}

export const terminalTools = {
  runTerminalCommand: {
    description: "Run a shell command (always asks confirmation). Use for git, npm, scripts, ports etc.",
    params: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" },
        cwd: { type: "string", description: "Working directory override (uses remembered cwd by default)" },
      },
      required: ["command"],
    } as const,
    handler({ command, cwd }: { command: string; cwd?: string }): string {
      const cmd = sanitize(command);
      if (isBlocked(cmd)) {
        return "Blocked: this command matches a dangerous pattern and will not be executed.";
      }

      const runIn = cwd ? resolveCwd(cwd) : currentCwd;

      if (!fs.existsSync(runIn)) {
        return `Error: working directory does not exist: ${runIn}`;
      }

      const confirmed = askConfirm(cmd, runIn);
      if (!confirmed) return "Command cancelled by user.";

      const result = spawnSync("bash", ["-c", cmd], {
        encoding: "utf-8",
        cwd: runIn,
        timeout: 30_000,
        // Explicitly pipe stdout/stderr and ignore stdin to avoid
        // conflicts with readline's stdin management.
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      const stdout = result.stdout?.trim() ?? "";
      const stderr = result.stderr?.trim() ?? "";

      if (result.error) return `Error: ${result.error.message}`;
      if (result.status !== 0) return `Exit ${result.status ?? "?"}: ${stderr || "(no error output)"}`;
      return stdout || "(command ran with no output)";
    },
  },

  setWorkingDirectory: {
    description: "Set the default directory for future terminal commands.",
    params: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "Absolute or ~ path" },
      },
      required: ["dirPath"],
    } as const,
    handler({ dirPath }: { dirPath: string }): string {
      const resolved = resolveCwd(dirPath);
      if (!fs.existsSync(resolved)) return `Error: directory does not exist: ${resolved}`;
      if (!fs.statSync(resolved).isDirectory()) return `Error: not a directory: ${resolved}`;
      currentCwd = resolved;
      return `Working directory set to: ${currentCwd}`;
    },
  },

  getWorkingDirectory: {
    description: "Get the current default working directory.",
    params: { type: "object", properties: {} } as const,
    handler(): string {
      return `Current working directory: ${currentCwd}`;
    },
  },
} satisfies ChatSessionModelFunctions;
