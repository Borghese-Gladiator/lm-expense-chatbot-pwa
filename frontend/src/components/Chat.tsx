import React from 'react';
import Message from './Message';
import styles from './Chat.module.css';
import { TMessage } from '../types';

interface ChatProps {
  messages: TMessage[];
  chatRef: React.RefObject<HTMLDivElement>;
}

const Chat: React.FC<ChatProps> = ({ messages, chatRef }) => {
  return (
    <div className={styles.chatContainer} ref={chatRef}>
      {messages.map((message, index) => (
        <Message key={index} {...message} />
      ))}
    </div>
  );
};

export default Chat;
