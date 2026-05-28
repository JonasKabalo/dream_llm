import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Root of the project — wherever `npm start` is run from
export const PROJECT_ROOT = process.cwd();

export const MODEL_PATH = path.join(__dirname, "..", "models", "hf_bartowski_phi-4-Q4_K_M.gguf");

export const SYSTEM_PROMPT = `You are Dream, a personal AI assistant running locally on the user's Mac.
You help with writing emails, general questions, file management, notes, terminal commands, and day-to-day tasks.
You communicate primarily in English but write in French when explicitly asked.
You have access to tools — use them whenever the user asks about time, date, files, weather, clipboard, system, or terminal.
Be concise, helpful, and direct. Do not add unnecessary filler or apologies.`;
