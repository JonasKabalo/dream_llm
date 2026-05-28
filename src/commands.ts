import { printToolsList } from "./ui.js";

type CommandHandler = () => void;

const commands: Record<string, CommandHandler> = {
  "/tools-list": printToolsList,
};

export function isCommand(input: string): boolean {
  return input.startsWith("/");
}

export function runCommand(input: string): boolean {
  const handler = commands[input.trim().toLowerCase()];
  if (handler) {
    handler();
    return true;
  }
  console.log(`Unknown command: ${input}. Available: ${Object.keys(commands).join(", ")}`);
  return false;
}
