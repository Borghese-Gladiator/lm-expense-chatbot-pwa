'use client';

import * as React from "react";
import { cn } from "@/lib/utils";

const MessageContext = React.createContext({});

const Message = React.forwardRef(({ className, from, ...props }, ref) => {
  return (
    <MessageContext.Provider value={{ from }}>
      <div
        ref={ref}
        className={cn(
          "flex gap-3",
          from === "user" ? "flex-row-reverse" : "flex-row",
          className
        )}
        {...props}
      />
    </MessageContext.Provider>
  );
});
Message.displayName = "Message";

const MessageAvatar = React.forwardRef(({ className, src, name, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-muted",
        className
      )}
      {...props}
    >
      {src ? (
        <img src={src} alt={name} className="size-8 rounded-full" />
      ) : (
        <span className="text-xs font-medium">{name?.[0]?.toUpperCase()}</span>
      )}
    </div>
  );
});
MessageAvatar.displayName = "MessageAvatar";

const MessageContent = React.forwardRef(({ className, ...props }, ref) => {
  const { from } = React.useContext(MessageContext);

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-2",
        from === "user"
          ? "items-end"
          : "items-start",
        className
      )}
    >
      <div
        className={cn(
          "rounded-lg px-4 py-2.5 text-sm",
          from === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        )}
        {...props}
      />
    </div>
  );
});
MessageContent.displayName = "MessageContent";

export { Message, MessageAvatar, MessageContent };

