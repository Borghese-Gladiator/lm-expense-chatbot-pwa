'use client';

import { Loader } from '@/components/ui/shadcn-io/ai/loader';
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ui/shadcn-io/ai/prompt-input';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ui/shadcn-io/ai/reasoning';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ui/shadcn-io/ai/source';
import { Button } from '@/components/ui/button';
import { ReceiptIcon, SquarePenIcon } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useState, useRef, useEffect } from 'react';

const models = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  { id: 'llama-3.1-70b', name: 'Llama 3.1 70B' },
];

const sampleResponses = [
  {
    content: "I'd be delighted to help you with that! React is a brilliant JavaScript library for building user interfaces. What specific aspect would you like to explore?",
    reasoning: "The user is asking about React, which is quite a broad topic. I should provide a helpful overview whilst asking for more specific information to give a more targeted response.",
    sources: [
      { title: "React Official Documentation", url: "https://react.dev" },
      { title: "React Developer Tools", url: "https://react.dev/learn" }
    ]
  },
  {
    content: "Next.js is an absolutely marvellous framework built on top of React that provides server-side rendering, static site generation, and many other powerful features straight out of the box.",
    reasoning: "The user mentioned Next.js, so I should explain its relationship to React and highlight its key benefits for modern web development.",
    sources: [
      { title: "Next.js Documentation", url: "https://nextjs.org/docs" },
      { title: "Vercel Next.js Guide", url: "https://vercel.com/guides/nextjs" }
    ]
  },
  {
    content: "TypeScript adds static type checking to JavaScript, which helps catch errors early and improves code quality tremendously. It's particularly valuable in larger applications, I must say.",
    reasoning: "TypeScript is becoming increasingly important in modern development. I should explain its benefits whilst keeping the explanation accessible.",
    sources: [
      { title: "TypeScript Handbook", url: "https://www.typescriptlang.org/docs" },
      { title: "TypeScript with React", url: "https://react.dev/learn/typescript" }
    ]
  }
];

export default function Home() {
  const [messages, setMessages] = useState([
    {
      id: nanoid(),
      content: "Hello! I'm your AI assistant. I can help you with coding questions, explain concepts, and provide guidance on web development topics. What would you like to know?",
      role: 'assistant',
      timestamp: new Date(),
      sources: [
        { title: "Getting Started Guide", url: "#" },
        { title: "API Documentation", url: "#" }
      ]
    }
  ]);

  const [inputValue, setInputValue] = useState('');
  const [selectedModel, setSelectedModel] = useState(models[0].id);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const simulateTyping = useCallback((messageId, content, reasoning, sources) => {
    let currentIndex = 0;
    const typeInterval = setInterval(() => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          const currentContent = content.slice(0, currentIndex);
          return {
            ...msg,
            content: currentContent,
            isStreaming: currentIndex < content.length,
            reasoning: currentIndex >= content.length ? reasoning : undefined,
            sources: currentIndex >= content.length ? sources : undefined,
          };
        }
        return msg;
      }));
      currentIndex += Math.random() > 0.1 ? 1 : 0; // Simulate variable typing speed
      
      if (currentIndex >= content.length) {
        clearInterval(typeInterval);
        setIsTyping(false);
        setStreamingMessageId(null);
      }
    }, 50);
    return () => clearInterval(typeInterval);
  }, []);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    
    if (!inputValue.trim() || isTyping) return;

    // Add user message
    const userMessage = {
      id: nanoid(),
      content: inputValue.trim(),
      role: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate AI response with delay
    setTimeout(() => {
      const responseData = sampleResponses[Math.floor(Math.random() * sampleResponses.length)];
      const assistantMessageId = nanoid();
      
      const assistantMessage = {
        id: assistantMessageId,
        content: '',
        role: 'assistant',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamingMessageId(assistantMessageId);
      
      // Start typing simulation
      simulateTyping(assistantMessageId, responseData.content, responseData.reasoning, responseData.sources);
    }, 800);
  }, [inputValue, isTyping, simulateTyping]);

  const handleReset = useCallback(() => {
    setMessages([
      {
        id: nanoid(),
        content: "Hello! I'm your AI assistant. I can help you with coding questions, explain concepts, and provide guidance on web development topics. What would you like to know?",
        role: 'assistant',
        timestamp: new Date(),
        sources: [
          { title: "Getting Started Guide", url: "#" },
          { title: "API Documentation", url: "#" }
        ]
      }
    ]);
    setInputValue('');
    setIsTyping(false);
    setStreamingMessageId(null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sticky Navbar */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ReceiptIcon className="h-5 w-5" />
          </div>
          <span className="font-semibold text-lg">Expense Assistant</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="h-9 gap-2 px-3"
        >
          <SquarePenIcon className="h-4 w-4" />
          <span>New Chat</span>
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col">

        {/* Conversation Area */}
        <div className="flex-1 overflow-y-auto">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={message.role === 'assistant' ? 'bg-muted/50' : 'bg-background'}
            >
              <div className="mx-auto max-w-3xl px-4 py-6">
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {message.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {message.isStreaming && message.content === '' ? (
                      <div className="flex items-center gap-2">
                        <Loader size={14} />
                        <span className="text-muted-foreground text-sm">Thinking...</span>
                      </div>
                    ) : (
                      <div>{message.content}</div>
                    )}
                  </div>

                  {/* Reasoning */}
                  {message.reasoning && (
                    <div className="mt-2">
                      <Reasoning isStreaming={message.isStreaming} defaultOpen={false}>
                        <ReasoningTrigger />
                        <ReasoningContent>{message.reasoning}</ReasoningContent>
                      </Reasoning>
                    </div>
                  )}

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2">
                      <Sources>
                        <SourcesTrigger count={message.sources.length} />
                        <SourcesContent>
                          {message.sources.map((source, index) => (
                            <Source key={index} href={source.url} title={source.title} />
                          ))}
                        </SourcesContent>
                      </Sources>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-border bg-background px-4 py-6">
          <div className="mx-auto max-w-3xl">
            <PromptInput onSubmit={handleSubmit} className="shadow-md">
              <div className="flex items-end gap-3">
                <PromptInputTextarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Message Expense Assistant..."
                  disabled={isTyping}
                  className="flex-1"
                />
                <PromptInputSubmit
                  disabled={!inputValue.trim() || isTyping}
                  status={isTyping ? 'streaming' : 'ready'}
                  className="mb-0.5"
                />
              </div>
              {/* Commented out: Attachment, Voice, and Model Selection
              <PromptInputToolbar>
                <PromptInputTools>
                  <PromptInputButton disabled={isTyping} className="hover:bg-accent">
                    <PaperclipIcon size={16} />
                  </PromptInputButton>
                  <PromptInputButton disabled={isTyping} className="hover:bg-accent">
                    <MicIcon size={16} />
                    <span>Voice</span>
                  </PromptInputButton>
                  <PromptInputModelSelect
                    value={selectedModel}
                    onValueChange={setSelectedModel}
                    disabled={isTyping}
                  >
                    <PromptInputModelSelectTrigger>
                      <PromptInputModelSelectValue />
                    </PromptInputModelSelectTrigger>
                    <PromptInputModelSelectContent>
                      {models.map((model) => (
                        <PromptInputModelSelectItem key={model.id} value={model.id}>
                          {model.name}
                        </PromptInputModelSelectItem>
                      ))}
                    </PromptInputModelSelectContent>
                  </PromptInputModelSelect>
                </PromptInputTools>
                <PromptInputSubmit
                  disabled={!inputValue.trim() || isTyping}
                  status={isTyping ? 'streaming' : 'ready'}
                  className="shadow-sm"
                />
              </PromptInputToolbar>
              */}
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}
