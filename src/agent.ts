import { DreamModel, type ChatMeta } from "./model.js";
import { allTools } from "./tools/index.js";

export class Agent {
  private model: DreamModel;

  constructor(model: DreamModel) {
    this.model = model;
  }

  async warmup(): Promise<void> {
    // Prefill system prompt + tool descriptions into the KV cache by running
    // a minimal prompt. maxTokens:1 means almost no generation time — we only
    // care about the prefill so the first real user message hits a warm cache.
    try {
      await this.model.chat("Hi", allTools, undefined, 1);
    } catch {
      // non-fatal — worst case the first message is still slow
    }
  }

  async respond(userMessage: string, onChunk?: (token: string) => void): Promise<ChatMeta> {
    return this.model.chat(userMessage, allTools, onChunk);
  }
}
