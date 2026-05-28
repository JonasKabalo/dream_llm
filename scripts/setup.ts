import path from "path";
import { fileURLToPath } from "url";
import { createModelDownloader } from "node-llama-cpp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.join(__dirname, "..", "models");

console.log("Downloading Phi-4 14B Q4_K_M (~8.5GB)...");
console.log("This may take a while depending on your connection.\n");

const downloader = await createModelDownloader({
  modelUrl: "hf:bartowski/phi-4-GGUF/phi-4-Q4_K_M.gguf",
  dirPath: modelsDir,
  onProgress: ({ downloadedSize, totalSize }) => {
    const pct = totalSize > 0 ? ((downloadedSize / totalSize) * 100).toFixed(1) : "?";
    const downloaded = (downloadedSize / 1024 / 1024 / 1024).toFixed(2);
    const total = (totalSize / 1024 / 1024 / 1024).toFixed(2);
    process.stdout.write(`\rDownloading: ${pct}% (${downloaded} / ${total} GB)`);
  },
});

await downloader.download();

console.log("\n\nModel ready. Run: npm start");
