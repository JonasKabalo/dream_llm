import readline from "readline";
import fs from "fs";
import { DreamModel } from "./model.js";
import { Agent } from "./agent.js";
import { MODEL_PATH, SYSTEM_PROMPT } from "./config.js";
import { isCommand, runCommand } from "./commands.js";
import { printBanner, printLoading, clearLoading, printGoodbye, printStats, startThinking, prompt } from "./ui.js";

async function main(): Promise<void> {
  if (!fs.existsSync(MODEL_PATH)) {
    console.error(`Model not found at: ${MODEL_PATH}`);
    console.error("Run: npm run setup");
    process.exit(1);
  }

  printBanner();
  printLoading();

  const model = new DreamModel();
  await model.load({ modelPath: MODEL_PATH, contextSize: 4096 }, SYSTEM_PROMPT);

  clearLoading();

  const agent = new Agent(model);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });

  let isGenerating = false;
  let pendingExit = false;

  const cleanup = async (): Promise<void> => {
    printGoodbye();
    await model.dispose();
    process.exit(0);
  };

  rl.on("close", () => {
    if (isGenerating) { pendingExit = true; } else { cleanup(); }
  });

  process.on("SIGINT", () => {
    if (isGenerating) { pendingExit = true; } else { cleanup(); }
  });

  const promptUser = (): void => {
    rl.question(prompt.you, async (input: string) => {
      const message = input.trim();

      if (!message) { promptUser(); return; }

      if (isCommand(message)) {
        runCommand(message);
        promptUser();
        return;
      }

      isGenerating = true;

      const stopThinking = startThinking();
      let firstChunk = true;

      const result = await agent.respond(message, (chunk) => {
        if (firstChunk) {
          stopThinking();
          process.stdout.write(prompt.dream);
          firstChunk = false;
        }
        process.stdout.write(chunk);
      });

      if (firstChunk) stopThinking();

      process.stdout.write("\n");
      printStats(result.ms, result.tokens);
      isGenerating = false;

      if (pendingExit) { await cleanup(); } else { promptUser(); }
    });
  };

  promptUser();
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
