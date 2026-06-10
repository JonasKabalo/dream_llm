#!/usr/bin/env node
import fs from "fs";
import os from "os";
import chalk from "chalk";
import { DreamModel } from "./model.js";
import { Agent } from "./agent.js";
import { activeModel, modelPath, SYSTEM_PROMPT } from "./config.js";
import { isCommand, runCommand } from "./commands.js";
import { printBanner, startLoadingPhase, clearLoading, printGoodbye, printStats, startThinking, prompt } from "./ui.js";
import { readInput } from "./input.js";
import { setupLayout, toInputZone, clearInputZone, resetLayout, scrollEnd } from "./layout.js";

// ── CLI subcommand routing ────────────────────────────────────────────────────
const subcommand = process.argv[2];
if (subcommand) {
  if (subcommand === "version") {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version: string };
    console.log(`dream v${pkg.version}`);
    process.exit(0);
  }

  if (subcommand === "update") {
    const { execSync } = await import("child_process");
    console.log("Updating dream to the latest version...");
    try {
      execSync("npm install -g dream-local@latest", { stdio: "inherit" });
    } catch {
      console.error("Update failed. Try: npm install -g dream-local@latest");
      process.exit(1);
    }
    process.exit(0);
  }

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
    console.error("Available: dream setup | dream setup-github | dream setup-gmail | dream setup-apollo | dream version | dream update");
    process.exit(1);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

let loadedModel: DreamModel | null = null;

async function main(): Promise<void> {
  const spec = activeModel();
  const specPath = modelPath(spec);
  if (!fs.existsSync(specPath)) {
    console.error(`Model not found at: ${specPath}`);
    console.error("Run: dream setup");
    process.exit(1);
  }

  // Run below normal priority so the rest of the machine stays responsive
  // while the model is generating (inference threads otherwise starve the UI).
  try { os.setPriority(0, 10); } catch { /* not critical */ }

  process.stdout.write("\x1b[2J\x1b[H"); // clear screen so banner always starts at row 1
  printBanner(spec.label);

  const stopLoading = startLoadingPhase("Loading model");
  const model = new DreamModel();
  loadedModel = model;
  await model.load({ modelPath: specPath, wrapper: spec.wrapper }, SYSTEM_PROMPT);
  const loadMs = stopLoading();

  const agent = new Agent(model);

  const stopWarmup = startLoadingPhase("Warming cache");
  await agent.warmup();
  const warmMs = stopWarmup();

  const stats = model.stats;
  clearLoading(loadMs, warmMs, stats ? `ctx ${stats.contextSize} · gpu ${stats.gpuLayers}/${stats.totalLayers}` : undefined);
  // Banner (10 rows) + Ready line put the cursor around row 12. On terminals too
  // short for banner + input zone, the saved cursor would land INSIDE the input
  // zone — start from a clean screen instead of restoring into it.
  const BANNER_ROWS = 12;
  if (scrollEnd() <= BANNER_ROWS) {
    process.stdout.write("\x1b[2J\x1b[H");
    setupLayout();
    process.stdout.write("\x1b[H"); // conversation starts at the top of the scroll region
  } else {
    process.stdout.write("\x1b7"); // save cursor right after the Ready line
    setupLayout();
    process.stdout.write("\x1b8"); // restore so conversation starts here, not at scrollEnd
  }
  process.stdout.write("\n");

  let isGenerating = false;
  let pendingExit = false;

  const cleanup = async (): Promise<void> => {
    resetLayout();
    process.stdout.write("\x1b[J"); // clear from cursor to end of screen
    printGoodbye();
    await model.dispose();
    process.exit(0);
  };

  // Handles Ctrl+C while the model is generating (raw mode is off during that
  // time, so readInput can't catch it itself).
  process.on("SIGINT", () => {
    if (isGenerating) {
      pendingExit = true;
    } else {
      cleanup();
    }
  });

  // On terminal resize, re-apply the scroll region for the new dimensions.
  process.on("SIGWINCH", setupLayout);

  while (true) {
    process.stdout.write("\x1b7"); // save cursor in output zone before going to input
    toInputZone();
    const input = await readInput(prompt.you);

    // Ctrl+C / Ctrl+D during input
    if (input === null) {
      await cleanup();
      return;
    }

    const message = input.trim();
    // Restore cursor to last output position, echo there, then clear the input zone.
    process.stdout.write("\x1b8");
    if (message) process.stdout.write(prompt.you + message + "\n");
    process.stdout.write("\x1b7"); // save position after echo
    clearInputZone();
    process.stdout.write("\x1b8"); // restore to after echo, ready for response

    if (!message) continue;

    if (isCommand(message)) {
      runCommand(message);
      continue;
    }

    isGenerating = true;

    // Spinner state machine: "Thinking..." before text, "Using <tool>…" while
    // a tool runs, back to "Thinking..." after it — cleared whenever text flows.
    let stopSpinner: (() => void) | null = startThinking();
    const clearSpinner = (): void => {
      if (stopSpinner) {
        stopSpinner();
        stopSpinner = null;
      }
    };
    let firstChunk = true;
    let lineDirty = false; // characters written since the last newline

    try {
      const result = await agent.respond(
        message,
        (chunk) => {
          clearSpinner();
          if (firstChunk) {
            process.stdout.write(prompt.dream);
            firstChunk = false;
          }
          process.stdout.write(chunk);
          lineDirty = !chunk.endsWith("\n");
        },
        (ev) => {
          clearSpinner();
          if (ev.type === "start") {
            // Don't overwrite a half-written text line with the spinner
            if (lineDirty) {
              process.stdout.write("\n");
              lineDirty = false;
            }
            stopSpinner = startThinking(`Using ${ev.name}…`);
          } else {
            stopSpinner = startThinking(); // model digests the tool result
          }
        },
      );

      // Nothing streamed (e.g. the whole response was filtered tool-call syntax,
      // or the model emitted no text segment) — fall back to the cleaned final
      // text so the user never gets a silent turn.
      clearSpinner();
      if (firstChunk) {
        const fallback = result.text.trim();
        process.stdout.write(
          prompt.dream + (fallback || chalk.dim("(the model returned an empty response — try rephrasing)")),
        );
      }
      process.stdout.write("\n");
      printStats(result.ms, result.tokens);
      process.stdout.write("\n");
    } catch (err: unknown) {
      clearSpinner();
      process.stdout.write("\n");
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  Error: ${msg}\n`);
      process.stdout.write("\n");
    }

    isGenerating = false;

    if (pendingExit) { await cleanup(); return; }
  }
}

main().catch(async (err: unknown) => {
  console.error("Fatal error:", err);
  if (loadedModel) await loadedModel.dispose().catch(() => {});
  process.exit(1);
});
