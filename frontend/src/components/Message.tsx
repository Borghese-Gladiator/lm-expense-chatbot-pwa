import React from 'react';
import styles from './Message.module.css';

interface MessageProps {
  text: string;
  sender: 'user' | 'bot';
}

const Message: React.FC<MessageProps> = ({ text, sender }) => {
  return (
    <div className={`${styles.message} ${sender === 'user' ? styles.user : styles.bot}`}>
      <span>{text}</span>
    </div>
  );
};

export default Message;
