type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Reply = { status: number; body: Json } | ((request: Json) => { status: number; body: Json });

export class FakeAnthropic {
  requests: Json[] = [];
  private queue: Reply[] = [];

  answer(query: Json, explanation = "fake explanation") {
    this.queue.push({ status: 200, body: this.message({ query, explanation }) });
    return this;
  }

  answerText(text: string, stopReason = "end_turn") {
    this.queue.push({ status: 200, body: this.message(text, stopReason) });
    return this;
  }

  refuse() {
    this.queue.push({ status: 200, body: this.message("", "refusal") });
    return this;
  }

  fail(status: number, type = "api_error") {
    this.queue.push({ status, body: { type: "error", error: { type, message: "injected" } } });
    return this;
  }

  private message(content: unknown, stopReason = "end_turn"): Json {
    const text = typeof content === "string" ? content : JSON.stringify(content);
    return {
      id: "msg_fake",
      type: "message",
      role: "assistant",
      model: "fake",
      content: text ? [{ type: "text", text }] : [],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  }

  get lastRequest(): Json {
    return this.requests.at(-1)!;
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const request = JSON.parse(String(init?.body ?? "{}"));
    this.requests.push({ path: url.pathname, ...request });
    const next = this.queue.shift();
    if (!next) return Response.json({ type: "error", error: { type: "api_error", message: "no reply queued" } }, { status: 500 });
    const { status, body } = typeof next === "function" ? next(request) : next;
    return Response.json(body, { status });
  };
}
