import { useState, useEffect, useCallback, useRef } from 'react';
import * as webllm from '@mlc-ai/web-llm';

/**
 * Custom hook for WebLLM integration
 * Manages model loading, initialization, and chat completion
 */
export function useWebLLM() {
  const [engine, setEngine] = useState(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [loadingPercentage, setLoadingPercentage] = useState(0);
  const [currentModel, setCurrentModel] = useState(null);
  const [error, setError] = useState(null);
  const engineRef = useRef(null);

  // Available models with function calling support
  // Only Hermes models support function calling in WebLLM
  const availableModels = [
    {
      id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
      name: 'Hermes 3 Llama 3.1 8B',
      size: '~5GB',
      supportsTools: true,
    },
    {
      id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC',
      name: 'Hermes 2 Pro Llama 3 8B',
      size: '~5GB',
      supportsTools: true,
    },
    {
      id: 'Hermes-2-Pro-Mistral-7B-q4f16_1-MLC',
      name: 'Hermes 2 Pro Mistral 7B',
      size: '~4.5GB',
      supportsTools: true,
    },
  ];

  /**
   * Initialize or reload a model
   */
  const loadModel = useCallback(async (modelId) => {
    try {
      setIsModelLoading(true);
      setError(null);
      setLoadingProgress('Initializing...');

      // Create a new engine instance
      const newEngine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (progress) => {
          setLoadingProgress(progress.text);
          // Extract percentage from progress text if available
          const percentMatch = progress.text.match(/(\d+)%/);
          if (percentMatch) {
            setLoadingPercentage(parseInt(percentMatch[1]));
          } else if (progress.progress !== undefined) {
            setLoadingPercentage(Math.round(progress.progress * 100));
          }
        },
      });

      engineRef.current = newEngine;
      setEngine(newEngine);
      setCurrentModel(modelId);
      setIsModelLoaded(true);
      setLoadingProgress('Model loaded successfully');
    } catch (err) {
      console.error('Error loading model:', err);
      setError(err.message || 'Failed to load model');
      setIsModelLoaded(false);
    } finally {
      setIsModelLoading(false);
    }
  }, []);

  /**
   * Generate a chat completion with optional function calling support (streaming)
   */
  const generateChatCompletion = useCallback(
    async (messages, onChunk, onComplete, tools = null, onToolCall = null) => {
      if (!engine || !isModelLoaded) {
        throw new Error('Model not loaded. Please load a model first.');
      }

      try {
        // Prepare completion options
        const completionOptions = {
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 1024,
        };

        // Add tools if provided
        if (tools && tools.length > 0) {
          completionOptions.tools = tools;
          completionOptions.tool_choice = 'auto';
        }

        const completion = await engine.chat.completions.create(completionOptions);

        let fullResponse = '';
        let toolCalls = [];

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta;

          // Handle text content
          const content = delta?.content || '';
          if (content) {
            fullResponse += content;
            if (onChunk) {
              onChunk(content, fullResponse);
            }
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              const index = toolCall.index;

              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: toolCall.id || `call_${Date.now()}_${index}`,
                  type: 'function',
                  function: {
                    name: toolCall.function?.name || '',
                    arguments: toolCall.function?.arguments || '',
                  },
                };
              } else {
                // Accumulate arguments if streaming
                if (toolCall.function?.arguments) {
                  toolCalls[index].function.arguments += toolCall.function.arguments;
                }
              }
            }
          }
        }

        // If tool calls were made, execute them
        if (toolCalls.length > 0 && onToolCall) {
          const result = await onToolCall(toolCalls, fullResponse);
          return result;
        }

        if (onComplete) {
          onComplete(fullResponse);
        }

        return fullResponse;
      } catch (err) {
        console.error('Error generating completion:', err);
        throw err;
      }
    },
    [engine, isModelLoaded]
  );

  /**
   * Unload the current model and free resources
   */
  const unloadModel = useCallback(async () => {
    if (engineRef.current) {
      try {
        // WebLLM doesn't have an explicit unload, but we can clear references
        engineRef.current = null;
        setEngine(null);
        setIsModelLoaded(false);
        setCurrentModel(null);
        setLoadingProgress('');
      } catch (err) {
        console.error('Error unloading model:', err);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current = null;
      }
    };
  }, []);

  return {
    // State
    engine,
    isModelLoading,
    isModelLoaded,
    loadingProgress,
    loadingPercentage,
    currentModel,
    error,
    availableModels,

    // Methods
    loadModel,
    generateChatCompletion,
    unloadModel,
  };
}
