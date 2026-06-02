import {
  getLlama,
  LlamaChatSession,
  JinjaTemplateChatWrapper,
  type LlamaModel,
  type LlamaContext,
  type LlamaContextSequence,
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
  private sequence: LlamaContextSequence | null = null;
  private session: LlamaChatSession | null = null;
  private temperature: number = 0.7;
  private systemPrompt: string = "";
  private chatWrapper: JinjaTemplateChatWrapper | "auto" = "auto";

  async load(config: ModelConfig, systemPrompt: string): Promise<void> {
    this.temperature = config.temperature ?? 0.7;
    this.systemPrompt = systemPrompt;
    this.llama = await getLlama();
    this.model = await this.llama.loadModel({ modelPath: config.modelPath });
    this.context = await this.model.createContext({
      contextSize: config.contextSize ?? 8192,
      flashAttention: true,
    });

    const jinjaTemplate = this.model.fileInfo.metadata?.tokenizer?.chat_template;
    this.chatWrapper = jinjaTemplate
      ? new JinjaTemplateChatWrapper({
          template: jinjaTemplate,
          functionCallMessageTemplate: {
            call: "[call: {{functionName}}({{functionParams}})]",
            result: "\n[result: {{functionCallResult}}]\n",
          },
        })
      : "auto";

    this.sequence = this.context.getSequence();
    this.session = new LlamaChatSession({
      contextSequence: this.sequence,
      systemPrompt,
      chatWrapper: this.chatWrapper,
    });
  }

  private resetSession(): void {
    if (!this.context) return;
    // Dispose the old sequence so its slot is returned to the context before allocating a new one.
    // Without this, getSequence() throws "No sequences left" because the context only has one slot.
    try { this.sequence?.dispose(); } catch { /* ignore */ }
    this.sequence = this.context.getSequence();
    this.session = new LlamaChatSession({
      contextSequence: this.sequence,
      systemPrompt: this.systemPrompt,
      chatWrapper: this.chatWrapper,
    });
  }

  async chat(
    message: string,
    functions?: ChatSessionModelFunctions,
    onChunk?: (token: string) => void,
    maxTokens?: number,
  ): Promise<ChatMeta> {
    if (!this.session) throw new Error("Model not loaded. Call load() first.");

    let tokens = 0;
    const start = Date.now();

    const doPrompt = async (): Promise<string> =>
      this.session!.prompt(message, {
        functions,
        onTextChunk: onChunk
          ? (chunk) => {
              const clean = chunk
                .replace(/\|\|answer:\s*/g, "")
                .replace(/\[call:\s*[^\]]*\]\s*/g, "")
                .replace(/\[result:\s*[^\]]*\]\s*/g, "")
                .replace(/\[(?:Result|List\s+contents?)\s+(?:of\s+)?[^\]]*\]\s*/g, "")
                .replace(/\(Note:[^)]*\)\s*/g, "");
              if (clean) onChunk(clean);
            }
          : undefined,
        onToken: () => { tokens++; },
        temperature: this.temperature,
        maxTokens,
      });

    let text: string;
    try {
      text = await doPrompt();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("context shift strategy") || msg.includes("context size")) {
        // Conversation history too long — clear it and retry with just this message
        this.resetSession();
        tokens = 0;
        text = await doPrompt();
      } else {
        throw err;
      }
    }

    const cleanText = text
      .replace(/\|\|answer:\s*/g, "")
      .replace(/\[call:\s*[^\]]*\]\s*/g, "")
      .replace(/\[result:\s*[^\]]*\]\s*/g, "");
    return { text: cleanText, tokens, ms: Date.now() - start };
  }

  async dispose(): Promise<void> {
    try { this.sequence?.dispose(); } catch { /* ignore */ }
    this.context?.dispose();
    this.model?.dispose();
    await this.llama?.dispose();
  }
}
