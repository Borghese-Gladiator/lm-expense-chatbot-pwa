// app/page.jsx
"use client";

import { useState } from "react";
import ChatBox from "@/components/ChatBox";
import { WebLLMLanguageModel } from "@/lib/webllm";

export default function HomePage() {
  const [messages, setMessages] = useState([]);

  const handleSend = async (prompt) => {
    // Add user message
    setMessages((prev) => [...prev, { text: prompt, from: "user" }]);

    // Add placeholder for AI message
    setMessages((prev) => [...prev, { text: "", from: "ai" }]);

    let streamedText = "";
    console.info("[page] Sending prompt to WebLLM:", prompt);

    const messageHistory = [{ role: "user", content: prompt }];

    try {
      // We pass onStream so the adapter will invoke it per delta,
      // and we also iterate the async generator for completeness and logs.
      const gen = WebLLMLanguageModel.generate(messageHistory, {
        onStream: (delta) => {
          // Update last AI message as new deltas arrive
          streamedText += delta;
          setMessages((prev) => {
            const newMessages = [...prev];
            // Ensure last message exists and is AI
            if (!newMessages.length || newMessages[newMessages.length - 1].from !== "ai") {
              newMessages.push({ text: streamedText, from: "ai" });
            } else {
              newMessages[newMessages.length - 1].text = streamedText;
            }
            return newMessages;
          });
        },
      });

      // Iterate the generator too — this gives us per-yield visibility and final return
      for await (const part of gen) {
        // part.text will be the delta that we already handled in onStream;
        // but we can log or use it for additional client-side processing.
        console.debug("[page] generator yielded:", part?.text?.slice?.(0, 120));
      }

      // After the generator finishes, ensure final text is set (defensive)
      setMessages((prev) => {
        const newMessages = [...prev];
        if (!newMessages.length || newMessages[newMessages.length - 1].from !== "ai") {
          newMessages.push({ text: streamedText, from: "ai" });
        } else {
          newMessages[newMessages.length - 1].text = streamedText;
        }
        return newMessages;
      });

      console.info("[page] Finished streaming. final length:", streamedText.length);
    } catch (err) {
      console.error("[page] Error generating AI response:", err);
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].text = "[Error generating response]";
        return newMessages;
      });
    }
  };

  return <ChatBox messages={messages} onSend={handleSend} />;
}
