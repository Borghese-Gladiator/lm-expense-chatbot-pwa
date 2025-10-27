// components/Message.tsx
export default function Message({ text, from }) {
  const align = from === "user" ? "text-right" : "text-left";
  const bg = from === "user" ? "bg-blue-200" : "bg-gray-200";
  return (
    <div className={`my-1 p-2 rounded ${bg} ${align}`}>
      {text}
    </div>
  );
}
