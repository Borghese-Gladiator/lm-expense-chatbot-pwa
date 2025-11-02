'use client';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ui/shadcn-io/ai/conversation';
import { Loader } from '@/components/ui/shadcn-io/ai/loader';
import { Message, MessageAvatar, MessageContent } from '@/components/ui/shadcn-io/ai/message';
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ui/shadcn-io/ai/prompt-input';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ui/shadcn-io/ai/reasoning';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ui/shadcn-io/ai/source';
import { Button } from '@/components/ui/button';
import { MicIcon, PaperclipIcon, RotateCcwIcon } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';
import { useWebLLM } from '@/hooks/useWebLLM';

const SYSTEM_PROMPT = `You are a helpful AI assistant specialized in analyzing expense data from Lunch Money.
You help users understand their spending patterns, identify areas where they can save money, and provide financial insights.
Be concise, friendly, and actionable in your responses.`;

const models = [
  { id: 'webllm', name: 'WebLLM (On-Device)' },
];

export default function Home() {
  // Initialize WebLLM
  const {
    isLoading: isModelLoading,
    isModelLoaded,
    loadProgress,
    loadStatus,
    error: modelError,
    chat,
    resetChat,
    modelName
  } = useWebLLM();

  const [messages, setMessages] = useState([
    {
      id: nanoid(),
      content: "Hello! I'm your Lunch Money Expense Analyzer. I can help you understand your spending patterns, identify savings opportunities, and answer questions about your finances. What would you like to know?",
      role: 'assistant',
      timestamp: new Date(),
    }
  ]);

  const [inputValue, setInputValue] = useState('');
  const [selectedModel, setSelectedModel] = useState(models[0].id);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!inputValue.trim() || isTyping || !isModelLoaded) return;

    // Add user message
    const userMessage = {
      id: nanoid(),
      content: inputValue.trim(),
      role: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = inputValue.trim();
    setInputValue('');
    setIsTyping(true);

    try {
      // Create assistant message placeholder
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

      // Prepare conversation history for WebLLM
      const conversationHistory = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));

      // Add system prompt
      const messagesToSend = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory,
        { role: 'user', content: userInput }
      ];

      // Use WebLLM to generate response with streaming
      await chat(messagesToSend, (chunk, fullResponse) => {
        setMessages(prev => prev.map(msg => {
          if (msg.id === assistantMessageId) {
            return {
              ...msg,
              content: fullResponse,
              isStreaming: true,
            };
          }
          return msg;
        }));
      });

      // Mark streaming as complete
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return {
            ...msg,
            isStreaming: false,
          };
        }
        return msg;
      }));

      setIsTyping(false);
      setStreamingMessageId(null);
    } catch (error) {
      console.error('Error generating response:', error);

      // Add error message
      const errorMessageId = nanoid();
      setMessages(prev => [...prev, {
        id: errorMessageId,
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        role: 'assistant',
        timestamp: new Date(),
        isError: true,
      }]);

      setIsTyping(false);
      setStreamingMessageId(null);
    }
  }, [inputValue, isTyping, isModelLoaded, chat, messages]);

  const handleReset = useCallback(async () => {
    setMessages([
      {
        id: nanoid(),
        content: "Hello! I'm your Lunch Money Expense Analyzer. I can help you understand your spending patterns, identify savings opportunities, and answer questions about your finances. What would you like to know?",
        role: 'assistant',
        timestamp: new Date(),
      }
    ]);
    setInputValue('');
    setIsTyping(false);
    setStreamingMessageId(null);

    // Reset WebLLM chat context
    await resetChat();
  }, [resetChat]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="flex h-[800px] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`size-2 rounded-full ${isModelLoaded ? 'bg-green-500' : isModelLoading ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="font-medium text-sm">
                {isModelLoaded ? 'Expense Analyzer' : isModelLoading ? 'Loading Model...' : 'Model Error'}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <span className="text-muted-foreground text-xs">
              {modelName || models.find(m => m.id === selectedModel)?.name}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-8 px-2"
            disabled={!isModelLoaded}
          >
            <RotateCcwIcon className="size-4" />
            <span className="ml-1">Reset</span>
          </Button>
        </div>

        {/* Model Loading Progress */}
        {isModelLoading && (
          <div className="border-b bg-blue-50 dark:bg-blue-950/20 px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-900 dark:text-blue-100">{loadStatus}</span>
                <span className="font-medium text-blue-900 dark:text-blue-100">{loadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 ease-out"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                First load will download the AI model (~1GB). This will be cached for future use.
              </p>
            </div>
          </div>
        )}

        {/* Model Error */}
        {modelError && !isModelLoading && (
          <div className="border-b bg-red-50 dark:bg-red-950/20 px-4 py-3">
            <p className="text-red-900 dark:text-red-100 text-sm">
              Error loading model: {modelError}
            </p>
          </div>
        )}

        {/* Conversation Area */}
        <Conversation className="flex-1">
          <ConversationContent className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="space-y-3">
                <Message from={message.role}>
                  <MessageContent>
                    {message.isStreaming && message.content === '' ? (
                      <div className="flex items-center gap-2">
                        <Loader size={14} />
                        <span className="text-muted-foreground text-sm">Thinking...</span>
                      </div>
                    ) : (
                      message.content
                    )}
                  </MessageContent>
                  <MessageAvatar 
                    src={message.role === 'user' ? 'https://github.com/dovazencot.png' : 'https://github.com/vercel.png'} 
                    name={message.role === 'user' ? 'User' : 'AI'} 
                  />
                </Message>

                {/* Reasoning */}
                {message.reasoning && (
                  <div className="ml-10">
                    <Reasoning isStreaming={message.isStreaming} defaultOpen={false}>
                      <ReasoningTrigger />
                      <ReasoningContent>{message.reasoning}</ReasoningContent>
                    </Reasoning>
                  </div>
                )}

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="ml-10">
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
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Input Area */}
        <div className="border-t p-4">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask me anything about development, coding, or technology..."
              disabled={isTyping}
            />
            <PromptInputToolbar>
              <PromptInputTools>
                <PromptInputButton disabled={isTyping}>
                  <PaperclipIcon size={16} />
                </PromptInputButton>
                <PromptInputButton disabled={isTyping}>
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
                disabled={!inputValue.trim() || isTyping || !isModelLoaded}
                status={isTyping ? 'streaming' : 'ready'}
              />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
