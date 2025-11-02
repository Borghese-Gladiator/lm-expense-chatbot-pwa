// lib/webllmAdapter.js
import { CreateMLCEngine } from "@mlc-ai/web-llm";
import system_prompt from "@/lib/system_prompt";

let engine = null;
async function initEngine() {
  if (engine) return engine;
  console.info("[webllmAdapter] Initializing MLCEngine...");
  const start = Date.now();
  engine = await CreateMLCEngine(
    "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    {
      initProgressCallback: (p) => console.debug("[webllmAdapter] init progress:", p),
      logLevel: "INFO",
    }
  );
  console.info("[webllmAdapter] Engine initialized in", Date.now() - start, "ms");
  // Log available keys on the engine for debugging compatibility issues
  try {
    console.debug("[webllmAdapter] engine keys:", Object.keys(engine));
    if (engine.chat) console.debug("[webllmAdapter] engine.chat keys:", Object.keys(engine.chat));
  } catch (e) {
    console.warn("[webllmAdapter] Could not inspect engine shape:", e);
  }
  return engine;
}

function extractDeltaFromChunk(chunk) {
  // Try several common locations for streaming text deltas
  try {
    if (!chunk) return "";
    // Common: chunk.choices[0].delta.content
    const choices = chunk.choices ?? chunk.choice ?? [];
    const c0 = choices[0] ?? {};
    const deltaContent =
      c0?.delta?.content ??
      c0?.delta ?? // sometimes delta is already a string
      c0?.message?.content ??
      chunk?.content ??
      chunk?.delta ??
      "";
    // Normalize non-string deltas
    return typeof deltaContent === "string" ? deltaContent : JSON.stringify(deltaContent);
  } catch (err) {
    console.warn("[webllmAdapter] Failed to extract delta from chunk:", err, chunk);
    return "";
  }
}

export const WebLLMLanguageModel = {
  id: "webllm",
  name: "WebLLM (local)",
  description: "Local Llama-3 model via WebLLM",
  specificationVersion: "v2",

  // Async generator (streaming) + final return
  async *generate(messages, options = {}) {
    const startAll = Date.now();
    const eng = await initEngine();
    const fullMessages = [{ role: "system", content: system_prompt }, ...messages];
    const temperature = options?.temperature ?? 1;

    console.info("[webllmAdapter] generate() called. temperature:", temperature);
    console.debug("[webllmAdapter] messages:", fullMessages);

    // If no streaming requested, do a one-shot request
    if (!options?.onStream) {
      console.info("[webllmAdapter] non-streaming path");
      const t0 = Date.now();
      const completion = await eng.chat.completions.create({
        messages: fullMessages,
        temperature,
      });
      const text =
        completion?.choices?.[0]?.message?.content ??
        completion?.choices?.[0]?.text ??
        completion?.content ??
        "";
      console.info("[webllmAdapter] non-streaming completion received in", Date.now() - t0, "ms");
      yield { text };
      return { text };
    }

    // Streaming path
    console.info("[webllmAdapter] streaming path - requesting stream from engine");
    const tStart = Date.now();
    let stream;
    try {
      // create(...) returns an async iterable when stream: true
      stream = await eng.chat.completions.create({
        messages: fullMessages,
        temperature,
        stream: true,
      });
      console.info("[webllmAdapter] stream request accepted (took", Date.now() - tStart, "ms)");
    } catch (err) {
      console.error("[webllmAdapter] Error requesting stream from engine:", err);
      throw err;
    }

    let accumulated = "";
    try {
      for await (const chunk of stream) {
        const delta = extractDeltaFromChunk(chunk);
        if (!delta) {
          // sometimes chunk may be a heartbeat or usage object — log and continue
          console.debug("[webllmAdapter] non-text streaming chunk:", chunk);
          continue;
        }

        accumulated += delta;
        // Log chunk-level info (small, frequent)
        console.debug("[webllmAdapter] chunk.delta:", delta);
        console.debug("[webllmAdapter] accumulated length:", accumulated.length);

        // Call onStream callback (frontend will usually update UI here)
        try {
          options.onStream(delta);
        } catch (cbErr) {
          console.warn("[webllmAdapter] onStream callback threw:", cbErr);
        }

        // Yield an incremental chunk to async-iterator consumers
        yield { text: delta };
      }
    } catch (streamErr) {
      console.error("[webllmAdapter] Error while iterating stream:", streamErr);
      throw streamErr;
    }

    console.info(
      "[webllmAdapter] streaming finished. total length:",
      accumulated.length,
      "time:",
      Date.now() - startAll,
      "ms"
    );

    // Final return - full accumulated text
    return { text: accumulated };
  },
};

export const WebLLMProvider = {
  id: "webllm-provider",
  name: "WebLLM Provider",
  specificationVersion: "v2",
  models: [WebLLMLanguageModel],
};
