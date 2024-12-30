export interface TUserMessage {
  text: string;
  sender: 'user';
}
export interface TBotMessage {
  text: string;
  sender: 'bot';
  graphData: { name: string; uv: number; pv: number }[] | null;  // null means explicitly no data
}
export type TMessage = TUserMessage | TBotMessage;
