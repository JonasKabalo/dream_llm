#!/usr/bin/env node
import fs from "fs";
import { DreamModel } from "./model.js";
import { Agent } from "./agent.js";
import { MODEL_PATH, SYSTEM_PROMPT } from "./config.js";
import { isCommand, runCommand } from "./commands.js";
import { printBanner, startLoadingPhase, clearLoading, printGoodbye, printStats, startThinking, prompt } from "./ui.js";
import { readInput } from "./input.js";

// ── CLI subcommand routing ────────────────────────────────────────────────────
const subcommand = process.argv[2];
if (subcommand) {
  const routes: Record<string, () => Promise<{ run: () => Promise<void> }>> = {
    "setup":        () => import("./setup/model.js"),
    "setup-github": () => import("./setup/github.js"),
    "setup-gmail":  () => import("./setup/gmail.js"),
    "setup-apollo": () => import("./setup/apollo.js"),
  };
  const loader = routes[subcommand];
  if (loader) {
    const mod = await loader();
    await mod.run();
    process.exit(0);
  } else {
    console.error(`Unknown command: dream ${subcommand}`);
    console.error("Available: dream setup | dream setup-github | dream setup-gmail | dream setup-apollo");
    process.exit(1);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

let activeModel: DreamModel | null = null;

async function main(): Promise<void> {
  if (!fs.existsSync(MODEL_PATH)) {
    console.error(`Model not found at: ${MODEL_PATH}`);
    console.error("Run: dream setup");
    process.exit(1);
  }

  printBanner();

  const stopLoading = startLoadingPhase("Loading model");
  const model = new DreamModel();
  activeModel = model;
  await model.load({ modelPath: MODEL_PATH }, SYSTEM_PROMPT);
  const loadMs = stopLoading();

  const agent = new Agent(model);

  const stopWarmup = startLoadingPhase("Warming cache");
  await agent.warmup();
  const warmMs = stopWarmup();

  clearLoading(loadMs, warmMs);

  let isGenerating = false;
  let pendingExit = false;

  const cleanup = async (): Promise<void> => {
    printGoodbye();
    await model.dispose();
    process.exit(0);
  };

  // Handles Ctrl+C while the model is generating (raw mode is off during that time)
  process.on("SIGINT", () => {
    if (isGenerating) { pendingExit = true; } else { cleanup(); }
  });

  while (true) {
    const input = await readInput(prompt.you);

    // Ctrl+C / Ctrl+D during input
    if (input === null) {
      await cleanup();
      return;
    }

    const message = input.trim();
    if (!message) continue;

    if (isCommand(message)) {
      runCommand(message);
      continue;
    }

    isGenerating = true;

    const stopThinking = startThinking();
    let firstChunk = true;

    try {
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
    } catch (err: unknown) {
      if (firstChunk) stopThinking();
      process.stdout.write("\n");
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  Error: ${msg}\n`);
    }

    isGenerating = false;

    if (pendingExit) { await cleanup(); return; }
  }
}

main().catch(async (err: unknown) => {
  console.error("Fatal error:", err);
  if (activeModel) await activeModel.dispose().catch(() => {});
  process.exit(1);
});
