import { DreamModel, type ChatMeta } from "./model.js";
import { allTools } from "./tools/index.js";

export class Agent {
  private model: DreamModel;

  constructor(model: DreamModel) {
    this.model = model;
  }

  async respond(userMessage: string, onChunk?: (token: string) => void): Promise<ChatMeta> {
    return this.model.chat(userMessage, allTools, onChunk);
  }
}
