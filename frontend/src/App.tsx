import React, { useRef, useState } from 'react';
import Chat from './components/Chat';
import ChatInput from './components/ChatInput';
import Graph from './components/Graph';
import styles from './App.module.css';
import HeroBanner from './components/HeroBanner';
import { TMessage } from './types';

const defaultMessage = 'Type "graph" to generate a graph.';

const App: React.FC = () => {
  const [messages, setMessages] = useState<TMessage[]>([]);

  const handleNewMessage = (message: string) => {
    const newMessage: TMessage = { text: message, sender: 'user' };
    setMessages([...messages, newMessage]);

    if (message.toLowerCase().includes('graph')) {
      const graphResponse = generateGraphData(message);
      setMessages((prevMessages) => [
        ...prevMessages,
        { text: 'Here is your graph', sender: 'bot', graphData: graphResponse },
      ]);
    } else {
      setMessages((prevMessages) => [
        ...prevMessages,
        { text: 'I don’t understand. Type "graph" to generate a graph.', sender: 'bot', graphData: null },
      ]);
    }
  };

  const generateGraphData = (input: string) => {
    // Sample data for a line chart
    return [
      { name: 'January', uv: 65, pv: 50 },
      { name: 'February', uv: 59, pv: 60 },
      { name: 'March', uv: 80, pv: 75 },
      { name: 'April', uv: 81, pv: 90 },
      { name: 'May', uv: 56, pv: 60 },
    ];
  };

  const chatRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <HeroBanner chatRef={chatRef} onSendDefaultMessage={() => handleNewMessage(defaultMessage)} />
      <Chat chatRef={chatRef} messages={messages} />
      <ChatInput onSendMessage={handleNewMessage} />
    </>
  );
};

export default App;
