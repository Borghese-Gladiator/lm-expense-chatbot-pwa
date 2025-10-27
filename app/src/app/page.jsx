"use client";

import { useState } from "react";
import { streamText } from "ai";
import { WebLLMProvider } from "@/lib/webllm";
import ChatBox from "@/components/ChatBox";

import { AI } from "ai";

const ai = new AI({ providers: [WebLLMProvider] });

export default function HomePage() {
  const [messages, setMessages] = useState([]);

  const handleSend = async (prompt) => {
    // Add user message
    setMessages((prev) => [...prev, { text: prompt, from: "user" }]);

    let streamedText = "";

    // Add placeholder for AI message
    setMessages((prev) => [...prev, { text: "", from: "ai" }]);

    const ai = new AI({ providers: [WebLLMProvider] });
    const result = streamText({
      model: "webllm",
      prompt,
      onStream: (chunk) => console.log("delta:", chunk),
    });

    for await (const part of result.fullStream) {
      if (part.type === "delta") {
        streamedText += part.delta;

        // Update last AI message in real-time
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].text = streamedText;
          return newMessages;
        });
      }

      // Optional: handle raw provider-specific chunks
      if (part.type === "raw") {
        console.log("Raw chunk:", part.rawValue);
      }
    }

    // Ensure final text is correct
    setMessages((prev) => {
      const newMessages = [...prev];
      newMessages[newMessages.length - 1].text = streamedText;
      return newMessages;
    });
  };

  return <ChatBox messages={messages} onSend={handleSend} />;
}

/*
"use client";

import { useState } from "react";
import { generateText } from "ai";
import { webllmAdapter } from "@/lib/webllm";
import ChatBox from "@/components/ChatBox";

export default function HomePage() {
  const [messages, setMessages] = useState([]);

  const handleSend = async (prompt) => {
    setMessages((prev) => [...prev, { text: prompt, from: "user" }]);
    let streamedText = "";

    const { text } = await generateText({
      model: webllmAdapter,
      prompt,
      onStream(token) {
        streamedText += token;
        // update last AI message in real-time
        setMessages((prev) => {
          const newMessages = [...prev];
          if (newMessages[newMessages.length - 1]?.from === "ai") {
            newMessages[newMessages.length - 1].text = streamedText;
          } else {
            newMessages.push({ text: streamedText, from: "ai" });
          }
          return newMessages;
        });
      },
    });

    // ensure final text
    setMessages((prev) => {
      const newMessages = [...prev];
      if (newMessages[newMessages.length - 1].from === "ai") {
        newMessages[newMessages.length - 1].text = text;
      }
      return newMessages;
    });
  };

  return <ChatBox messages={messages} onSend={handleSend} />;
}
*/