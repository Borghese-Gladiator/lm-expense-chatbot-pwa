// lib/webllmAdapter.ts
import { LanguageModelV2, ProviderV2 } from "ai";
import { CreateMLCEngine } from "@mlc-ai/web-llm";
import system_prompt from "@/lib/system_prompt";

// Singleton engine
let engine = null;

async function initEngine() {
  if (!engine) {
    engine = await CreateMLCEngine(
      "Llama-3.1-8B-Instruct-q4f32_1-MLC",
      { initProgressCallback: initProgressCallback }, // engineConfig
    );
    // engine = await WebLLMChatEngine.create({
    //   model: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    //   modelConfig: { contextWindowSize: 2048 },
    //   initProgressCallback: (progress) => console.log("MLC Init Progress:", progress),
    //   logLevel: "INFO",
    // });
  }
  return engine;
}

// Implement LanguageModelV2 interface
/*
const WebLLMLanguageModel = {
  id: "webllm",
  name: "WebLLM (local)",
  description: "Local Llama-3 model via WebLLM",
  async generate(messages, options) {
    const eng = await initEngine();

    // Prepend system prompt if not already in messages
    const fullMessages = [
      { role: "system", content: system_prompt },
      ...messages,
    ];

    let result = "";

    // Stream output if callback provided
    if (options?.onStream) {
      const stream = eng.streamChatCompletion({
        messages: fullMessages,
        temperature: options.temperature ?? 1,
      });

      for await (const chunk of stream) {
        const delta = chunk.delta?.content || "";
        result += delta;
        options.onStream(delta);
      }
    } else {
      // Non-streaming fallback
      const completion = await eng.chatCompletion({
        messages: fullMessages,
        temperature: options?.temperature ?? 1,
      });
      result = completion.content ?? "";
    }

    return { text: result };
  },
};
*/
const WebLLMLanguageModel = {
  id: "webllm",
  name: "WebLLM (local)",
  description: "Local Llama-3 model via WebLLM",
  specificationVersion: "v2",

  // V5 Streaming method
  async *generate(messages, options) {
    const eng = await initEngine();
    const fullMessages = [{ role: "system", content: system_prompt }, ...messages];

    const stream = eng.streamChatCompletion({
      messages: fullMessages,
      temperature: options?.temperature ?? 1,
    });

    let result = "";
    for await (const chunk of stream) {
      const delta = chunk.delta?.content ?? "";
      result += delta;
      if (options?.onStream) options.onStream(delta);
      yield { text: delta }; // V5 expects AsyncIterable of {text}
    }

    return { text: result }; // final full text
  },
};

// Wrap in a ProviderV2
export const WebLLMProvider = {
  id: "webllm-provider",
  name: "WebLLM Provider",
  specificationVersion: "v2",
  models: [WebLLMLanguageModel],
};
