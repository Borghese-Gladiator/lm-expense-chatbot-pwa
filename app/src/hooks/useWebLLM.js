'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as webllm from '@mlc-ai/web-llm';

// Default model - using a smaller model for faster loading
const DEFAULT_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

/**
 * Custom hook for managing WebLLM chat functionality
 * Handles model initialization, loading, caching, and chat interactions
 */
export function useWebLLM() {
  const [engine, setEngine] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState('');
  const [error, setError] = useState(null);
  const engineRef = useRef(null);

  // Initialize the engine on mount
  useEffect(() => {
    let isMounted = true;

    const initEngine = async () => {
      try {
        setIsLoading(true);
        setLoadStatus('Initializing WebLLM...');

        // Check if model is already cached
        const cacheKey = `webllm_model_${DEFAULT_MODEL}`;
        const isCached = localStorage.getItem(cacheKey) === 'true';

        if (isCached) {
          setLoadStatus('Loading cached model...');
        }

        // Create engine with progress callback
        const newEngine = await webllm.CreateMLCEngine(DEFAULT_MODEL, {
          initProgressCallback: (progress) => {
            if (!isMounted) return;

            setLoadProgress(Math.round(progress.progress * 100));
            setLoadStatus(progress.text || 'Loading model...');

            // If model is fully loaded, mark as cached
            if (progress.progress === 1) {
              localStorage.setItem(cacheKey, 'true');
              setIsModelLoaded(true);
              setIsLoading(false);
            }
          },
        });

        if (isMounted) {
          engineRef.current = newEngine;
          setEngine(newEngine);
        }
      } catch (err) {
        console.error('Failed to initialize WebLLM:', err);
        if (isMounted) {
          setError(err.message || 'Failed to initialize AI model');
          setIsLoading(false);
        }
      }
    };

    initEngine();

    return () => {
      isMounted = false;
      // Cleanup engine if needed
      if (engineRef.current) {
        // Note: WebLLM doesn't have a destroy method, but we clean up the ref
        engineRef.current = null;
      }
    };
  }, []);

  /**
   * Send a message to the AI and get a streaming response
   * @param {Array} messages - Array of message objects with {role, content}
   * @param {Function} onChunk - Callback for each streaming chunk
   * @returns {Promise<string>} - The complete response
   */
  const chat = useCallback(async (messages, onChunk) => {
    if (!engine) {
      throw new Error('Engine not initialized');
    }

    if (!isModelLoaded) {
      throw new Error('Model not loaded yet');
    }

    try {
      let fullResponse = '';

      // Use streaming API
      const completion = await engine.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 512,
      });

      // Process the stream
      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullResponse += delta;
          if (onChunk) {
            onChunk(delta, fullResponse);
          }
        }
      }

      return fullResponse;
    } catch (err) {
      console.error('Chat error:', err);
      throw new Error('Failed to generate response: ' + err.message);
    }
  }, [engine, isModelLoaded]);

  /**
   * Get non-streaming chat response
   * @param {Array} messages - Array of message objects with {role, content}
   * @returns {Promise<string>} - The complete response
   */
  const chatComplete = useCallback(async (messages) => {
    if (!engine) {
      throw new Error('Engine not initialized');
    }

    if (!isModelLoaded) {
      throw new Error('Model not loaded yet');
    }

    try {
      const completion = await engine.chat.completions.create({
        messages,
        stream: false,
        temperature: 0.7,
        max_tokens: 512,
      });

      return completion.choices[0]?.message?.content || '';
    } catch (err) {
      console.error('Chat error:', err);
      throw new Error('Failed to generate response: ' + err.message);
    }
  }, [engine, isModelLoaded]);

  /**
   * Reset the chat conversation
   */
  const resetChat = useCallback(async () => {
    if (engine) {
      try {
        await engine.resetChat();
      } catch (err) {
        console.error('Failed to reset chat:', err);
      }
    }
  }, [engine]);

  return {
    engine,
    isLoading,
    isModelLoaded,
    loadProgress,
    loadStatus,
    error,
    chat,
    chatComplete,
    resetChat,
    modelName: DEFAULT_MODEL,
  };
}
