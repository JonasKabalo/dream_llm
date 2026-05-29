import chalk from "chalk";

interface ToolEntry {
  icon: string;
  name: string;
  example: string;
  status?: "coming soon";
}

interface ToolSection {
  label: string;
  subtitle: string;
  color: (s: string) => string;
  tools: ToolEntry[];
}

const WIDTH = 58;

const SECTIONS: ToolSection[] = [
  {
    label: "OFFLINE",
    subtitle: "no internet required",
    color: chalk.green,
    tools: [
      { icon: "⏰", name: "Date & time",      example: "What time is it in Tokyo? / How many days until June 15?" },
      { icon: "📄", name: "Files",             example: "Create / read / edit / move / copy / delete / search files" },
      { icon: "📋", name: "Clipboard",         example: "Copy this to my clipboard / What's in my clipboard?" },
      { icon: "💻", name: "System info",       example: "How much memory am I using? / Battery level?" },
      { icon: "🚀", name: "Open app or file",  example: "Open Spotify / Open ~/Desktop/report.pdf" },
      { icon: "📝", name: "Notes",             example: "Save a note called 'Ideas' / Show my notes" },
      { icon: "🗓 ", name: "Date calculator",  example: "What day is it in 3 weeks? / Days since Jan 1?" },
      { icon: "⚡", name: "Terminal",          example: "Run git status / Set working dir to ~/project/dream" },
    ],
  },
  {
    label: "ONLINE",
    subtitle: "requires internet",
    color: chalk.yellow,
    tools: [
      { icon: "📧", name: "Gmail",   example: "Send an email / Draft an email / List my inbox" },
      { icon: "🌤 ", name: "Weather", example: "What's the weather in Paris? / What's the weather now?" },
      { icon: "🐙", name: "GitHub",  example: "List my repos / Create a PR / Open an issue" },
    ],
  },
];

function pad(text: string, width: number): string {
  const visible = text.replace(/\x1b\[[0-9;]*m/g, "");
  const spaces = Math.max(0, width - visible.length);
  return text + " ".repeat(spaces);
}

export function printBanner(): void {
  const title = "✦  D R E A M  ✦";
  const subtitle = "Your personal local AI assistant";
  console.log();
  console.log(chalk.dim("  ╭" + "─".repeat(WIDTH) + "╮"));
  console.log(chalk.dim("  │") + " ".repeat(WIDTH) + chalk.dim("│"));
  console.log(
    chalk.dim("  │") +
    chalk.bold.cyan(title.padStart((WIDTH + title.length) / 2).padEnd(WIDTH)) +
    chalk.dim("│"),
  );
  console.log(
    chalk.dim("  │") +
    chalk.dim(subtitle.padStart((WIDTH + subtitle.length) / 2).padEnd(WIDTH)) +
    chalk.dim("│"),
  );
  console.log(chalk.dim("  │") + " ".repeat(WIDTH) + chalk.dim("│"));
  console.log(chalk.dim("  ╰" + "─".repeat(WIDTH) + "╯"));
  console.log();
  console.log("  " + chalk.dim("Powered by Phi-4 14B  ·  Runs fully offline on M2"));
  console.log();
}

const LOAD_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function startLoadingPhase(label: string): () => number {
  let frameIdx = 0;
  const startTime = Date.now();

  const render = (): void => {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(
      "\r  " + chalk.yellow(LOAD_FRAMES[frameIdx]) +
      chalk.dim("  " + label + "  ") +
      chalk.yellow(secs + "s") + "   ",
    );
  };

  render();
  const id = setInterval(() => {
    frameIdx = (frameIdx + 1) % LOAD_FRAMES.length;
    render();
  }, 80);

  return (): number => {
    clearInterval(id);
    return Date.now() - startTime;
  };
}

export function clearLoading(loadMs: number, warmMs: number): void {
  const line =
    "  " + chalk.green("✓") + "  " +
    chalk.bold("Ready") +
    chalk.dim("  ·  Type ") +
    chalk.cyan("/tools-list") +
    chalk.dim(" to see what I can do.") +
    chalk.dim(`  (model ${(loadMs / 1000).toFixed(1)}s  ·  warmup ${(warmMs / 1000).toFixed(1)}s)`);
  process.stdout.write("\r" + line + "\n\n");
}

export function printGoodbye(): void {
  console.log("\n  " + chalk.dim("Goodbye!"));
}

export function printStats(ms: number, tokens: number): void {
  const secs = (ms / 1000).toFixed(1);
  const tps = ms > 0 ? (tokens / (ms / 1000)).toFixed(0) : "0";
  console.log(
    "  " + chalk.dim(`⏱  ${secs}s  ·  ${tokens} tokens  ·  ${tps} tok/s`),
  );
  console.log();
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function startThinking(): () => void {
  let i = 0;
  process.stdout.write("  " + chalk.dim(SPINNER_FRAMES[0] + "  Thinking..."));
  const id = setInterval(() => {
    i = (i + 1) % SPINNER_FRAMES.length;
    process.stdout.write("\r  " + chalk.dim(SPINNER_FRAMES[i] + "  Thinking..."));
  }, 80);
  return (): void => {
    clearInterval(id);
    process.stdout.write("\x1b[2K\r");
  };
}

export const prompt = {
  you: chalk.bold.green("You") + chalk.dim(" › "),
  dream: chalk.bold.magenta("Dream") + chalk.dim(" › "),
};

export function printToolsList(): void {
  const border = chalk.dim("─".repeat(WIDTH));
  const title = "✦  DREAM — TOOLS  ✦";

  console.log();
  console.log(chalk.dim("  ╭" + "─".repeat(WIDTH) + "╮"));
  console.log(
    chalk.dim("  │") +
    chalk.bold.cyan(title.padStart((WIDTH + title.length) / 2).padEnd(WIDTH)) +
    chalk.dim("│"),
  );
  console.log(chalk.dim("  ╰" + "─".repeat(WIDTH) + "╯"));
  console.log();

  for (const section of SECTIONS) {
    console.log(
      "  " + section.color("◆ " + chalk.bold(section.label)) +
      chalk.dim("  — " + section.subtitle),
    );
    console.log("  " + border);
    console.log();

    for (const tool of section.tools) {
      const nameCol = pad(chalk.white.bold(tool.name), 28);
      const exampleCol = tool.status
        ? chalk.dim(tool.example) + "  " + chalk.dim.italic(tool.status)
        : chalk.dim(tool.example);
      console.log(`    ${tool.icon}  ${nameCol}${exampleCol}`);
    }

    console.log();
  }

  console.log("  " + border);
  console.log("  " + chalk.dim("💡  Just describe what you want — Dream picks the right tool."));
  console.log("  " + chalk.dim("📋  Commands: ") + chalk.cyan("/tools-list"));
  console.log();
}
