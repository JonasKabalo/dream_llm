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
  // "auto": let node-llama-cpp resolve the model's native chat wrapper
  // (correct tool-call syntax for Qwen etc.). "phi-jinja": legacy custom
  // template for models without a native function-calling format (Phi-4).
  wrapper?: "auto" | "phi-jinja";
}

export interface ChatMeta {
  text: string;
  tokens: number;
  ms: number;
}

// Upper bound on generated tokens per user turn (includes any thinking
// tokens). Long enough for any sane assistant answer plus a capped think;
// bounds runaway generation (e.g. the model looping on a failing tool) to a
// few minutes instead of spinning forever.
const MAX_RESPONSE_TOKENS = 3072;

// Cap on internal "thinking" tokens for reasoning models (Qwen3.5). Without
// it the default is up to 75% of the context, which could spend the whole
// MAX_RESPONSE_TOKENS budget on thoughts and leave nothing for the answer.
const MAX_THOUGHT_TOKENS = 1024;

// Phi-4 supports a 16K context. Auto-fit to the available VRAM between these
// bounds: the 8.4 GB model alone consumes most of a 16 GB Mac, so a fixed
// large value crashes at startup there (InsufficientMemoryError), while big
// machines can comfortably hold the full window.
const CONTEXT_SIZE_RANGE = { min: 4096, max: 16384 };

// NOTE: prompt-lookup speculative decoding (InputLookupTokenPredictor) was
// tried here and measured SLOWER on this setup (interleaved A/B, 2026-06:
// plain 7.1 tok/s vs predictor 6.4 tok/s) — with the model fully offloaded to
// Metal, validation batches cost more than one-by-one decoding saves. Don't
// re-add without re-benchmarking (it may pay off after a smaller-model swap).

// ── Streaming output filter ──────────────────────────────────────────────────
// Phi-4 sometimes writes function-call syntax and internal markers as plain
// text: "[call: …]", "[result: …]", "[Result of …]", "(Note: …)", "||answer:".
// These arrive split across many small stream chunks, so a per-chunk regex can
// never match them — this filter carries state between chunks and only emits
// text that is provably outside any such segment.
const MARKER_OPENERS = ["[call:", "[result:", "[Result ", "[List ", "(Note:", "||answer:"] as const;
const LONGEST_OPENER = Math.max(...MARKER_OPENERS.map((o) => o.length));

export interface StreamCleaner {
  push: (chunk: string) => void;
  flush: () => void;
}

export function createStreamCleaner(emit: (text: string) => void): StreamCleaner {
  let pending = "";
  // Swallow whitespace at the start of the turn (thinking models like Qwen
  // emit a blob of newlines where the thought segment ended) and after a
  // dropped marker segment (matches the old `\s*` regex behaviour), so output
  // never starts with stray blank lines.
  let swallowLeadingWs = true;

  function heldTailLength(): number {
    // Longest suffix of `pending` that could still grow into an opener once
    // more chunks arrive — hold it back instead of emitting half a marker.
    const max = Math.min(pending.length, LONGEST_OPENER - 1);
    for (let len = max; len > 0; len--) {
      const tail = pending.slice(pending.length - len);
      if (MARKER_OPENERS.some((o) => o.length > len && o.startsWith(tail))) return len;
    }
    return 0;
  }

  function process(final: boolean): void {
    for (;;) {
      if (swallowLeadingWs) {
        pending = pending.replace(/^\s+/, "");
        if (pending.length === 0) return;
        swallowLeadingWs = false;
      }

      let openerIdx = -1;
      let opener = "";
      for (const o of MARKER_OPENERS) {
        const idx = pending.indexOf(o);
        if (idx >= 0 && (openerIdx < 0 || idx < openerIdx)) {
          openerIdx = idx;
          opener = o;
        }
      }

      if (openerIdx < 0) {
        const hold = final ? 0 : heldTailLength();
        if (pending.length > hold) {
          emit(pending.slice(0, pending.length - hold));
          pending = pending.slice(pending.length - hold);
        }
        return;
      }

      if (openerIdx > 0) {
        emit(pending.slice(0, openerIdx));
        pending = pending.slice(openerIdx);
      }

      if (opener === "||answer:") {
        pending = pending.slice(opener.length);
        swallowLeadingWs = true;
        continue;
      }

      const closer = opener.startsWith("(") ? ")" : "]";
      const closeIdx = pending.indexOf(closer, opener.length);
      if (closeIdx >= 0) {
        pending = pending.slice(closeIdx + 1);
        swallowLeadingWs = true;
        continue;
      }

      // Marker opened but not yet closed.
      if (final) {
        // "[call:"/"[result:" tails are junk by construction; the looser
        // "(Note:"/"[Result "/"[List " prefixes may be legitimate prose — emit
        // those rather than losing real text.
        if (opener !== "[call:" && opener !== "[result:") emit(pending);
        pending = "";
        return;
      }
      if (pending.length > 4000) {
        // Safety valve: an unclosed marker this long is almost certainly real
        // text that happens to contain the pattern — don't withhold an answer.
        emit(pending);
        pending = "";
        return;
      }
      return; // wait for more chunks
    }
  }

  return {
    push(chunk: string): void {
      pending += chunk;
      process(false);
    },
    flush(): void {
      process(true);
    },
  };
}

// Run a complete response text through the same filter (single code path for
// streamed chunks and the final text used as a display fallback).
export function cleanResponseText(text: string): string {
  let out = "";
  const cleaner = createStreamCleaner((s) => { out += s; });
  cleaner.push(text);
  cleaner.flush();
  return out.trim();
}
// ─────────────────────────────────────────────────────────────────────────────

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

    // When every layer runs on the GPU, extra CPU threads only spin-wait
    // between GPU ops — pure heat and fan noise for zero speed (measured:
    // 2 threads ≈ 4 threads tok/s on Apple Silicon). Keep the default thread
    // count only when some layers actually run on the CPU.
    const fullyOffloaded = this.model.gpuLayers >= this.model.fileInsights.totalLayers;

    this.context = await this.model.createContext({
      contextSize: config.contextSize ?? CONTEXT_SIZE_RANGE,
      flashAttention: true,
      ...(fullyOffloaded ? { threads: 2 } : {}),
    });

    const jinjaTemplate = this.model.fileInfo.metadata?.tokenizer?.chat_template;
    this.chatWrapper =
      config.wrapper !== "phi-jinja"
        ? "auto" // node-llama-cpp resolves the model's native wrapper (incl. tool syntax)
        : jinjaTemplate
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

  // Drop the conversation history (system prompt stays). The KV cache keeps
  // the shared prefix, so the next prompt still hits the warm cache. Used
  // after warmup: its maxTokens:1 turn cuts a thinking model off mid-`<think>`,
  // and that unfinished thought poisons every later turn if left in history.
  resetConversation(): void {
    this.session?.resetChatHistory();
  }

  // Runtime numbers worth surfacing in the UI (context auto-fits to VRAM, so
  // it varies per machine and per launch).
  get stats(): { contextSize: number; gpuLayers: number; totalLayers: number } | null {
    if (!this.context || !this.model) return null;
    return {
      contextSize: this.context.contextSize,
      gpuLayers: this.model.gpuLayers,
      totalLayers: this.model.fileInsights.totalLayers,
    };
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

    // A fresh cleaner per attempt: if a prompt fails mid-marker and is retried,
    // stale withheld text must not leak into the retry's output.
    const doPrompt = async (): Promise<string> => {
      const cleaner = onChunk ? createStreamCleaner(onChunk) : null;
      const text = await this.session!.prompt(message, {
        functions,
        onTextChunk: cleaner ? (chunk): void => cleaner.push(chunk) : undefined,
        onToken: () => { tokens++; },
        temperature: this.temperature,
        maxTokens: maxTokens ?? MAX_RESPONSE_TOKENS,
        budgets: { thoughtTokens: MAX_THOUGHT_TOKENS },
      });
      cleaner?.flush();
      return text;
    };

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

    return { text: cleanResponseText(text), tokens, ms: Date.now() - start };
  }

  async dispose(): Promise<void> {
    try { this.sequence?.dispose(); } catch { /* ignore */ }
    this.context?.dispose();
    this.model?.dispose();
    await this.llama?.dispose();
  }
}
