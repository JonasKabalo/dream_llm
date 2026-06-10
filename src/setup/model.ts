import { createModelDownloader } from "node-llama-cpp";
import { MODELS_DIR, MODELS } from "../config.js";

export async function run(): Promise<void> {
  // Download what was explicitly requested, else the default model — never the
  // activeModel() fallback (it would re-download the OLD model when the new
  // default hasn't been fetched yet, defeating the point of running setup).
  const requested = process.env.DREAM_MODEL?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const spec = requested === "phi4" ? MODELS.phi4 : MODELS.qwen;

  console.log("\n  Dream — Model Setup");
  console.log("  ─────────────────────────────────────");
  console.log(`  Downloading ${spec.label} (Q4_K_M)`);
  console.log("  This may take a while depending on your connection.\n");

  const downloader = await createModelDownloader({
    modelUrl: spec.downloadUri,
    dirPath: MODELS_DIR,
    onProgress: ({ downloadedSize, totalSize }) => {
      const pct = totalSize > 0 ? ((downloadedSize / totalSize) * 100).toFixed(1) : "?";
      const downloaded = (downloadedSize / 1024 / 1024 / 1024).toFixed(2);
      const total = (totalSize / 1024 / 1024 / 1024).toFixed(2);
      process.stdout.write(`\r  Downloading: ${pct}%  (${downloaded} / ${total} GB)`);
    },
  });

  const savedPath = await downloader.download();
  console.log(`\n\n  Model saved to ${savedPath}`);
  console.log("  All done! Run: dream\n");
}
