import React from 'react';
import Message from './Message';
import styles from './Chat.module.css';

interface MessageProps {
  text: string;
  sender: 'user' | 'bot';
}

interface ChatProps {
  messages: MessageProps[];
  chatRef: React.RefObject<HTMLDivElement>;
}

const Chat: React.FC<ChatProps> = ({ messages, chatRef }) => {
  return (
    <div className={styles.chatContainer} ref={chatRef}>
      {messages.map((msg, index) => (
        <Message key={index} text={msg.text} sender={msg.sender} />
      ))}
    </div>
  );
};

export default Chat;
