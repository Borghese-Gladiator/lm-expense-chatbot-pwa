import { useLocalStorage } from './useLocalStorage';
import { nanoid } from 'nanoid';

/**
 * Custom hook for managing chat history
 * Each chat has: id, title, messages, timestamp
 */
export function useChatHistory() {
  const [chats, setChats] = useLocalStorage('chat-history', []);
  const [currentChatId, setCurrentChatId] = useLocalStorage('current-chat-id', null);

  /**
   * Create a new chat
   * @returns {string} The new chat ID
   */
  const createNewChat = () => {
    const newChat = {
      id: nanoid(),
      title: 'New Chat',
      messages: [],
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setChats(prevChats => [newChat, ...prevChats]);
    setCurrentChatId(newChat.id);
    return newChat.id;
  };

  /**
   * Update messages for a specific chat
   * @param {string} chatId - The chat ID to update
   * @param {Array} messages - The new messages array
   */
  const updateChatMessages = (chatId, messages) => {
    setChats(prevChats =>
      prevChats.map(chat => {
        if (chat.id === chatId) {
          // Generate title from first user message if still "New Chat"
          let title = chat.title;
          if (title === 'New Chat' && messages.length > 0) {
            const firstUserMessage = messages.find(m => m.role === 'user');
            if (firstUserMessage) {
              title = firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
            }
          }

          return {
            ...chat,
            messages,
            title,
            updatedAt: new Date().toISOString(),
          };
        }
        return chat;
      })
    );
  };

  /**
   * Get a specific chat by ID
   * @param {string} chatId - The chat ID
   * @returns {Object|null} The chat object or null if not found
   */
  const getChatById = (chatId) => {
    return chats.find(chat => chat.id === chatId) || null;
  };

  /**
   * Delete a chat by ID
   * @param {string} chatId - The chat ID to delete
   */
  const deleteChat = (chatId) => {
    setChats(prevChats => prevChats.filter(chat => chat.id !== chatId));

    // If deleting current chat, clear current chat ID
    if (currentChatId === chatId) {
      setCurrentChatId(null);
    }
  };

  /**
   * Switch to a different chat
   * @param {string} chatId - The chat ID to switch to
   */
  const switchToChat = (chatId) => {
    setCurrentChatId(chatId);
  };

  /**
   * Get the current chat
   * @returns {Object|null} The current chat object or null
   */
  const getCurrentChat = () => {
    if (!currentChatId) return null;
    return getChatById(currentChatId);
  };

  /**
   * Clear all chat history
   */
  const clearAllChats = () => {
    setChats([]);
    setCurrentChatId(null);
  };

  return {
    chats,
    currentChatId,
    currentChat: getCurrentChat(),
    createNewChat,
    updateChatMessages,
    getChatById,
    deleteChat,
    switchToChat,
    clearAllChats,
  };
}
