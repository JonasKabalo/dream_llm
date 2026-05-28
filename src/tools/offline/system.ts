import { execSync } from "child_process";
import os from "os";
import path from "path";
import type { ChatSessionModelFunctions } from "node-llama-cpp";

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export const systemTools = {
  getSystemInfo: {
    description: "Get current system stats: memory usage, disk space, battery level, CPU load, and uptime.",
    params: { type: "object", properties: {} } as const,
    handler(): string {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const load = os.loadavg();
      const uptimeSec = os.uptime();
      const hours = Math.floor(uptimeSec / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);

      let disk = "unavailable";
      try {
        const df = execSync("df -h /", { encoding: "utf-8" }).split("\n")[1].trim().split(/\s+/);
        disk = `${df[2]} used of ${df[1]} (${df[4]} full)`;
      } catch { /* ignore */ }

      let battery = "unavailable";
      try {
        const raw = execSync("pmset -g batt", { encoding: "utf-8" });
        const match = raw.match(/(\d+)%;\s*(\w+)/);
        if (match) battery = `${match[1]}% — ${match[2]}`;
      } catch { /* ignore */ }

      return JSON.stringify({
        memory: `${formatBytes(usedMem)} used of ${formatBytes(totalMem)}`,
        disk,
        battery,
        cpu_load: `${load[0].toFixed(2)} / ${load[1].toFixed(2)} / ${load[2].toFixed(2)} (1/5/15 min avg)`,
        uptime: `${hours}h ${mins}m`,
        platform: `${os.type()} ${os.release()}`,
        hostname: os.hostname(),
      });
    },
  },

  openFile: {
    description: "Open a file with its default application on macOS (like double-clicking it).",
    params: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or ~ path to the file to open" },
      },
      required: ["filePath"],
    } as const,
    handler({ filePath }: { filePath: string }): string {
      const resolved = filePath.replace(/^~/, os.homedir());
      const safe = path.resolve(resolved);
      execSync(`open "${safe.replace(/"/g, '\\"')}"`);
      return `Opened: ${safe}`;
    },
  },

  openApp: {
    description: "Launch a macOS application by name (e.g. 'Spotify', 'Figma', 'Safari', 'VS Code').",
    params: {
      type: "object",
      properties: {
        appName: { type: "string", description: "Name of the app to open" },
      },
      required: ["appName"],
    } as const,
    handler({ appName }: { appName: string }): string {
      const safe = appName.replace(/"/g, "");
      execSync(`open -a "${safe}"`);
      return `Opened app: ${safe}`;
    },
  },
} satisfies ChatSessionModelFunctions;
