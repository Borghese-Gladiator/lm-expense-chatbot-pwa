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

  // Available models - you can expand this list
  const availableModels = [
    {
      id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.2 3B',
      size: '~2GB',
    },
    {
      id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.2 1B',
      size: '~700MB',
    },
    {
      id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
      name: 'Phi 3.5 Mini',
      size: '~2.3GB',
    },
    {
      id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
      name: 'Qwen 2.5 0.5B',
      size: '~350MB',
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
   * Generate a chat completion (streaming)
   */
  const generateChatCompletion = useCallback(
    async (messages, onChunk, onComplete) => {
      if (!engine || !isModelLoaded) {
        throw new Error('Model not loaded. Please load a model first.');
      }

      try {
        const completion = await engine.chat.completions.create({
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 1024,
        });

        let fullResponse = '';

        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            if (onChunk) {
              onChunk(content, fullResponse);
            }
          }
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
