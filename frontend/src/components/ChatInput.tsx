import React, { useState } from 'react';
import styles from './ChatInput.module.css';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState<string>('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.chatInput}>
      <input
        type="text"
        value={inputText}
        onChange={handleInputChange}
        placeholder="Type 'graph' to see a graph"
        className={styles.input}
      />
      <button type="submit" className={styles.button}>
        Send
      </button>
    </form>
  );
};

export default ChatInput;
