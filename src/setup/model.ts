import path from "path";
import os from "os";
import { createModelDownloader } from "node-llama-cpp";

export async function run(): Promise<void> {
  const modelsDir = path.join(os.homedir(), ".dream", "models");

  console.log("\n  Dream — Model Setup");
  console.log("  ─────────────────────────────────────");
  console.log("  Downloading Phi-4 14B Q4_K_M (~8.5 GB)");
  console.log("  This may take a while depending on your connection.\n");

  const downloader = await createModelDownloader({
    modelUrl: "hf:bartowski/phi-4-GGUF/phi-4-Q4_K_M.gguf",
    dirPath: modelsDir,
    onProgress: ({ downloadedSize, totalSize }) => {
      const pct = totalSize > 0 ? ((downloadedSize / totalSize) * 100).toFixed(1) : "?";
      const downloaded = (downloadedSize / 1024 / 1024 / 1024).toFixed(2);
      const total = (totalSize / 1024 / 1024 / 1024).toFixed(2);
      process.stdout.write(`\r  Downloading: ${pct}%  (${downloaded} / ${total} GB)`);
    },
  });

  await downloader.download();
  console.log(`\n\n  Model saved to ${modelsDir}`);
  console.log("  All done! Run: dream\n");
}
