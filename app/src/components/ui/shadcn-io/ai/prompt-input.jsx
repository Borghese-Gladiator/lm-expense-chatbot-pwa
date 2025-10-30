'use client';

import * as React from "react";
import { cn } from "@/lib/utils";
import { SendIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const PromptInputContext = React.createContext({});

const PromptInput = React.forwardRef(({ className, onSubmit, ...props }, ref) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.(e);
  };

  return (
    <form
      ref={ref}
      onSubmit={handleSubmit}
      className={cn("relative space-y-2 rounded-lg border bg-background p-2", className)}
      {...props}
    />
  );
});
PromptInput.displayName = "PromptInput";

const PromptInputTextarea = React.forwardRef(
  ({ className, ...props }, ref) => {
    const textareaRef = React.useRef(null);

    React.useImperativeHandle(ref, () => textareaRef.current);

    const adjustHeight = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      }
    };

    React.useEffect(() => {
      adjustHeight();
    }, [props.value]);

    const handleKeyDown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const form = e.currentTarget.form;
        if (form) {
          form.requestSubmit();
        }
      }
      props.onKeyDown?.(e);
    };

    return (
      <textarea
        ref={textareaRef}
        rows={1}
        className={cn(
          "w-full resize-none bg-transparent px-2 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        onInput={adjustHeight}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  }
);
PromptInputTextarea.displayName = "PromptInputTextarea";

const PromptInputToolbar = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex items-center justify-between gap-2", className)}
      {...props}
    />
  );
});
PromptInputToolbar.displayName = "PromptInputToolbar";

const PromptInputTools = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  );
});
PromptInputTools.displayName = "PromptInputTools";

const PromptInputButton = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-8 gap-1.5 text-xs", className)}
      {...props}
    />
  );
});
PromptInputButton.displayName = "PromptInputButton";

const PromptInputSubmit = React.forwardRef(
  ({ className, status = "ready", ...props }, ref) => {
    const isStreaming = status === "streaming";

    return (
      <Button
        ref={ref}
        type="submit"
        size="sm"
        className={cn("h-8 gap-1.5", className)}
        {...props}
      >
        {isStreaming ? (
          <>
            <SquareIcon className="size-3.5" />
            Stop
          </>
        ) : (
          <>
            <SendIcon className="size-3.5" />
            Send
          </>
        )}
      </Button>
    );
  }
);
PromptInputSubmit.displayName = "PromptInputSubmit";

// Model Select Components
const PromptInputModelSelect = React.forwardRef(
  ({ className, value, onValueChange, disabled, children, ...props }, ref) => {
    return (
      <PromptInputContext.Provider value={{ value, onValueChange, disabled }}>
        <DropdownMenu>
          <div ref={ref} className={cn("relative", className)} {...props}>
            {children}
          </div>
        </DropdownMenu>
      </PromptInputContext.Provider>
    );
  }
);
PromptInputModelSelect.displayName = "PromptInputModelSelect";

const PromptInputModelSelectTrigger = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    const { disabled } = React.useContext(PromptInputContext);

    return (
      <DropdownMenuTrigger
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </DropdownMenuTrigger>
    );
  }
);
PromptInputModelSelectTrigger.displayName = "PromptInputModelSelectTrigger";

const PromptInputModelSelectValue = React.forwardRef(
  ({ className, placeholder, ...props }, ref) => {
    const { value } = React.useContext(PromptInputContext);

    return (
      <span ref={ref} className={cn(className)} {...props}>
        {value || placeholder}
      </span>
    );
  }
);
PromptInputModelSelectValue.displayName = "PromptInputModelSelectValue";

const PromptInputModelSelectContent = React.forwardRef(
  ({ className, align = "end", side = "top", ...props }, ref) => {
    return (
      <DropdownMenuContent
        ref={ref}
        align={align}
        side={side}
        className={cn("min-w-[12rem]", className)}
        {...props}
      />
    );
  }
);
PromptInputModelSelectContent.displayName = "PromptInputModelSelectContent";

const PromptInputModelSelectItem = React.forwardRef(
  ({ className, value, children, ...props }, ref) => {
    const { onValueChange, value: selectedValue } = React.useContext(PromptInputContext);

    return (
      <DropdownMenuItem
        ref={ref}
        onSelect={() => onValueChange?.(value)}
        className={cn(
          "relative flex cursor-pointer items-center gap-2",
          selectedValue === value && "bg-accent",
          className
        )}
        {...props}
      >
        {children}
      </DropdownMenuItem>
    );
  }
);
PromptInputModelSelectItem.displayName = "PromptInputModelSelectItem";

export {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputModelSelect,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
};

