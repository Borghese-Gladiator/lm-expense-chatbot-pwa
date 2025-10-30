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
      className={cn("h-full overflow-y-auto px-4 py-4", className)}
      {...props}
    />
  );
});
ConversationContent.displayName = "ConversationContent";

const ConversationScrollButton = React.forwardRef(({ className, ...props }, ref) => {
  const { scrollButtonVisible, scrollToBottom } = React.useContext(ConversationContext);

  if (!scrollButtonVisible) return null;

  return (
    <div className="absolute bottom-4 right-4">
      <Button
        ref={ref}
        variant="outline"
        size="icon"
        className={cn("size-8 rounded-full shadow-lg", className)}
        onClick={scrollToBottom}
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    </div>
  );
});
ConversationScrollButton.displayName = "ConversationScrollButton";

export { Conversation, ConversationContent, ConversationScrollButton };

