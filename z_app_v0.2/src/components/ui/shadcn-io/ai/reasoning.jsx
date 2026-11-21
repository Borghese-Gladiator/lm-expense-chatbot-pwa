'use client';

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";

const Reasoning = React.forwardRef(
  ({ className, isStreaming, defaultOpen = false, children, ...props }, ref) => {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);

    return (
      <div ref={ref} className={cn("space-y-2", className)} {...props}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child, { isOpen, setIsOpen, isStreaming });
          }
          return child;
        })}
      </div>
    );
  }
);
Reasoning.displayName = "Reasoning";

const ReasoningTrigger = React.forwardRef(
  ({ className, isOpen, setIsOpen, isStreaming, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => setIsOpen?.(!isOpen)}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors",
          className
        )}
        {...props}
      >
        <ChevronDownIcon
          className={cn(
            "size-3.5 transition-transform",
            isOpen && "rotate-180"
          )}
        />
        <span>{isStreaming ? "Reasoning..." : "View reasoning"}</span>
      </button>
    );
  }
);
ReasoningTrigger.displayName = "ReasoningTrigger";

const ReasoningContent = React.forwardRef(
  ({ className, isOpen, children, ...props }, ref) => {
    if (!isOpen) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ReasoningContent.displayName = "ReasoningContent";

export { Reasoning, ReasoningTrigger, ReasoningContent };

