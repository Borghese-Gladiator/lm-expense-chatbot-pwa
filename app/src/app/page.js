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
import { Progress } from '@/components/ui/progress';
import { ChatSidebar } from '@/components/ChatSidebar';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useWebLLM } from '@/hooks/useWebLLM';
import { useToast } from '@/hooks/use-toast';
import { ReceiptIcon, SquarePenIcon, BrainCircuitIcon } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useState, useRef, useEffect } from 'react';


const getInitialMessages = () => [
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
];

export default function Home() {
  const {
    chats,
    currentChatId,
    currentChat,
    createNewChat,
    updateChatMessages,
    deleteChat,
    switchToChat,
  } = useChatHistory();

  const {
    isModelLoading,
    isModelLoaded,
    loadingProgress,
    loadingPercentage,
    currentModel,
    error: llmError,
    availableModels,
    loadModel,
    generateChatCompletion,
    unloadModel,
  } = useWebLLM();

  const [messages, setMessages] = useState(getInitialMessages());
  const [inputValue, setInputValue] = useState('');
  const [selectedModel, setSelectedModel] = useState('Qwen2.5-0.5B-Instruct-q4f16_1-MLC'); // Fastest model
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const messagesEndRef = useRef(null);
  const hasShownToast = useRef(false);
  const { toast } = useToast();

  // Show info toast when model starts loading for the first time
  useEffect(() => {
    if (isModelLoading && !hasShownToast.current) {
      hasShownToast.current = true;
      toast({
        variant: "info",
        title: "🧠 Downloading AI Model",
        description: "WebLLM is downloading the AI model to your browser. This only happens once and the model will be cached for future use. The model runs entirely on your device for complete privacy.",
        duration: 10000,
      });
    }
  }, [isModelLoading, toast]);

  // Auto-load default model on mount
  useEffect(() => {
    if (selectedModel && !isModelLoaded && !isModelLoading) {
      loadModel(selectedModel);
    }
  }, []);

  // Initialize with a new chat if none exists
  useEffect(() => {
    if (!currentChatId && chats.length === 0) {
      const newChatId = createNewChat();
      const initialMessages = getInitialMessages();
      updateChatMessages(newChatId, initialMessages);
      setMessages(initialMessages);
    } else if (currentChat) {
      // Load messages from current chat
      setMessages(currentChat.messages.length > 0 ? currentChat.messages : getInitialMessages());
    }
  }, [currentChatId]);

  // Save messages to local storage whenever they change
  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      updateChatMessages(currentChatId, messages);
    }
  }, [messages, currentChatId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const handleModelSelect = useCallback(async (modelId) => {
    setSelectedModel(modelId);
    setShowModelSelector(false);
    await loadModel(modelId);
  }, [loadModel]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!inputValue.trim() || isTyping) return;

    // Check if model is loaded
    if (!isModelLoaded) {
      setShowModelSelector(true);
      return;
    }

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

    try {
      // Prepare messages for WebLLM (convert to OpenAI format)
      const llmMessages = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // Generate completion with streaming
      await generateChatCompletion(
        llmMessages,
        // onChunk callback
        (chunk, fullResponse) => {
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
        },
        // onComplete callback
        (fullResponse) => {
          setMessages(prev => prev.map(msg => {
            if (msg.id === assistantMessageId) {
              return {
                ...msg,
                content: fullResponse,
                isStreaming: false,
              };
            }
            return msg;
          }));
          setIsTyping(false);
          setStreamingMessageId(null);
        }
      );
    } catch (error) {
      console.error('Error generating response:', error);

      // Show error message
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return {
            ...msg,
            content: `Error: ${error.message || 'Failed to generate response'}`,
            isStreaming: false,
          };
        }
        return msg;
      }));
      setIsTyping(false);
      setStreamingMessageId(null);
    }
  }, [inputValue, isTyping, isModelLoaded, messages, generateChatCompletion]);

  const handleReset = useCallback(() => {
    // Only create a new chat if there's actual message history (more than just the initial greeting)
    const hasUserMessages = messages.some(msg => msg.role === 'user');

    if (hasUserMessages) {
      const newChatId = createNewChat();
      const initialMessages = getInitialMessages();
      setMessages(initialMessages);
      updateChatMessages(newChatId, initialMessages);
    } else {
      // Just reset to initial state without creating a new chat
      setMessages(getInitialMessages());
    }

    setInputValue('');
    setIsTyping(false);
    setStreamingMessageId(null);
  }, [messages, createNewChat, updateChatMessages]);

  const handleSelectChat = useCallback((chatId) => {
    switchToChat(chatId);
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setMessages(chat.messages.length > 0 ? chat.messages : getInitialMessages());
      setInputValue('');
      setIsTyping(false);
      setStreamingMessageId(null);
    }
  }, [switchToChat, chats]);

  const handleDeleteChat = useCallback((chatId) => {
    deleteChat(chatId);
    // If we deleted the current chat, start a new one
    if (chatId === currentChatId) {
      const newChatId = createNewChat();
      const initialMessages = getInitialMessages();
      setMessages(initialMessages);
      updateChatMessages(newChatId, initialMessages);
    }
  }, [deleteChat, currentChatId, createNewChat, updateChatMessages]);

  return (
    <div className="flex min-h-screen">
      {/* Chat Sidebar */}
      <ChatSidebar
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        isOpen={isSidebarOpen}
        onToggle={setIsSidebarOpen}
      />

      {/* Main content area */}
      <div
        className="flex flex-1 flex-col bg-background transition-all duration-300"
        style={{ marginLeft: isSidebarOpen ? '280px' : '60px' }}
      >
        {/* Sticky Navbar - fully opaque */}
        <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ReceiptIcon className="h-5 w-5" />
            </div>
            <span className="font-semibold text-lg">Expense Assistant</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Model Status/Selector */}
            <Button
              variant={isModelLoaded ? "outline" : "default"}
              size="sm"
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="h-9 gap-2 px-3"
              disabled={isModelLoading}
            >
              <BrainCircuitIcon className="h-4 w-4" />
              <span>
                {isModelLoading ? 'Loading...' : isModelLoaded ? `${currentModel?.split('-')[0] || 'Model'}` : 'Load Model'}
              </span>
            </Button>

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
        </div>

        {/* Model Selector Dropdown */}
        {showModelSelector && (
          <div className="border-b border-border bg-muted px-4 py-3">
            <div className="mx-auto max-w-3xl">
              <h3 className="mb-3 text-sm font-semibold">Select a Model</h3>
              {isModelLoading && (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{loadingProgress}</span>
                    <span className="font-medium">{loadingPercentage}%</span>
                  </div>
                  <Progress value={loadingPercentage} className="h-2" />
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleModelSelect(model.id)}
                    disabled={isModelLoading}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                      currentModel === model.id ? 'border-primary bg-accent' : 'border-border'
                    } ${isModelLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-muted-foreground">{model.size}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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
    </div>
  );
}
