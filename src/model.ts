import {
  getLlama,
  LlamaChatSession,
  type LlamaModel,
  type LlamaContext,
  type Llama,
  type ChatSessionModelFunctions,
} from "node-llama-cpp";

export interface ModelConfig {
  modelPath: string;
  contextSize?: number;
  temperature?: number;
}

export interface ChatMeta {
  text: string;
  tokens: number;
  ms: number;
}

export class DreamModel {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private session: LlamaChatSession | null = null;
  private temperature: number = 0.7;

  async load(config: ModelConfig, systemPrompt: string): Promise<void> {
    this.temperature = config.temperature ?? 0.7;
    this.llama = await getLlama();
    this.model = await this.llama.loadModel({ modelPath: config.modelPath });
    this.context = await this.model.createContext({
      contextSize: config.contextSize ?? 4096,
    });
    this.session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
      systemPrompt,
    });
  }

  async chat(
    message: string,
    functions?: ChatSessionModelFunctions,
    onChunk?: (token: string) => void,
  ): Promise<ChatMeta> {
    if (!this.session) throw new Error("Model not loaded. Call load() first.");

    let tokens = 0;
    const start = Date.now();

    const text = await this.session.prompt(message, {
      functions,
      onTextChunk: onChunk,
      onToken: () => { tokens++; },
      temperature: this.temperature,
    });

    return { text, tokens, ms: Date.now() - start };
  }

  async dispose(): Promise<void> {
    this.context?.dispose();
    this.model?.dispose();
    await this.llama?.dispose();
  }
}
