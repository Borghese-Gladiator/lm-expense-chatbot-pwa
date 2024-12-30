import React from 'react';
import Graph from './Graph';
import styles from './Message.module.css';
import { TMessage } from '../types';

const Message: React.FC<TMessage> = (props) => {
  const { text, sender } = props;
  const isBot = sender === 'bot';

  return (
    <div className={`${styles.messageContainer} ${isBot ? styles.bot : styles.user}`}>
      <div className={styles.text}>{text}</div>
      {isBot && props.graphData && (
        <div className={`${styles.graph} ${isBot ? styles.alignLeft : styles.alignRight}`}>
          <Graph data={props.graphData} />
        </div>
      )}
    </div>
  );
};

export default Message;
