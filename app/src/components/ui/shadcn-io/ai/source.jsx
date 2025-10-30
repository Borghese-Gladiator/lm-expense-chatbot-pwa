'use client';

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";

const SourcesContext = React.createContext({});

const Sources = React.forwardRef(({ className, children, ...props }, ref) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <SourcesContext.Provider value={{ isOpen, setIsOpen }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props}>
        {children}
      </div>
    </SourcesContext.Provider>
  );
});
Sources.displayName = "Sources";

const SourcesTrigger = React.forwardRef(
  ({ className, count, ...props }, ref) => {
    const { isOpen, setIsOpen } = React.useContext(SourcesContext);

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
        <span>
          {count} {count === 1 ? "source" : "sources"}
        </span>
      </button>
    );
  }
);
SourcesTrigger.displayName = "SourcesTrigger";

const SourcesContent = React.forwardRef(
  ({ className, ...props }, ref) => {
    const { isOpen } = React.useContext(SourcesContext);

    if (!isOpen) return null;

    return (
      <div
        ref={ref}
        className={cn("space-y-2", className)}
        {...props}
      />
    );
  }
);
SourcesContent.displayName = "SourcesContent";

const Source = React.forwardRef(
  ({ className, href, title, ...props }, ref) => {
    return (
      <a
        ref={ref}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs transition-colors hover:bg-muted",
          className
        )}
        {...props}
      >
        <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{title}</span>
      </a>
    );
  }
);
Source.displayName = "Source";

export { Sources, SourcesTrigger, SourcesContent, Source };

