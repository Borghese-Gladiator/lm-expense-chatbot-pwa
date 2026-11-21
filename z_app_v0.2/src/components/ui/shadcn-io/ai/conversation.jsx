'use client';

import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const ConversationContext = React.createContext({});

const Conversation = React.forwardRef(({ className, ...props }, ref) => {
  const [scrollButtonVisible, setScrollButtonVisible] = React.useState(false);
  const scrollRef = React.useRef(null);

  const scrollToBottom = React.useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    <ConversationContext.Provider
      value={{ scrollButtonVisible, setScrollButtonVisible, scrollRef, scrollToBottom }}
    >
      <div ref={ref} className={cn("relative flex-1 overflow-hidden", className)} {...props} />
    </ConversationContext.Provider>
  );
});
Conversation.displayName = "Conversation";

const ConversationContent = React.forwardRef(({ className, ...props }, ref) => {
  const { scrollRef, setScrollButtonVisible } = React.useContext(ConversationContext);

  const handleScroll = React.useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setScrollButtonVisible(!isNearBottom);
    }
  }, [scrollRef, setScrollButtonVisible]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={cn("h-full overflow-y-auto px-6 py-6", className)}
      {...props}
    />
  );
});
ConversationContent.displayName = "ConversationContent";

const ConversationScrollButton = React.forwardRef(({ className, ...props }, ref) => {
  const { scrollButtonVisible, scrollToBottom } = React.useContext(ConversationContext);

  if (!scrollButtonVisible) return null;

  return (
    <div className="absolute bottom-6 right-6">
      <Button
        ref={ref}
        variant="outline"
        size="icon"
        className={cn("h-10 w-10 rounded-full shadow-md transition-all hover:scale-105", className)}
        onClick={scrollToBottom}
        {...props}
      >
        <ArrowDownIcon className="h-5 w-5" />
      </Button>
    </div>
  );
});
ConversationScrollButton.displayName = "ConversationScrollButton";

export { Conversation, ConversationContent, ConversationScrollButton };

