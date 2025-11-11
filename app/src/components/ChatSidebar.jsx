'use client';

import { Button } from '@/components/ui/button';
import {
  PanelLeftIcon,
  MessageSquareIcon,
  TrashIcon,
  MenuIcon,
  SquarePenIcon,
} from 'lucide-react';

export function ChatSidebar({
  chats = [],
  currentChatId,
  onSelectChat,
  onDeleteChat,
  onNewChat,
  isOpen = false,
  onToggle,
}) {
  const handleDeleteClick = (e, chatId) => {
    e.stopPropagation(); // Prevent selecting the chat when clicking delete
    if (window.confirm('Are you sure you want to delete this chat?')) {
      onDeleteChat(chatId);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));

    if (diffInHours < 24) {
      return 'Today';
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else if (diffInHours < 168) {
      // Less than a week
      return `${Math.floor(diffInHours / 24)} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  };

  return (
    <>
      {/* Floating Action Button - Mobile only */}
      <Button
        variant="default"
        size="icon"
        onClick={() => onToggle(!isOpen)}
        className="fixed left-4 top-4 z-50 h-12 w-12 rounded-full shadow-lg md:hidden"
        aria-label="Open menu"
      >
        <MenuIcon className="h-6 w-6" />
      </Button>

      {/* Sidebar - Desktop: always visible, Mobile: slides in from left */}
      <aside
        className={`fixed left-0 top-0 z-40 h-full border-r border-border bg-muted transition-all duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{ width: isOpen ? '280px' : '60px' }}
      >
        <div className="flex h-full flex-col">
          {/* Toggle button at top - Desktop only */}
          <div className={`hidden md:flex items-center border-b border-border p-3 ${isOpen ? 'justify-end' : 'justify-center'}`}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggle(!isOpen)}
              className="h-9 w-9"
              aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <PanelLeftIcon className={`h-5 w-5 transition-transform duration-300 ${isOpen ? '' : 'rotate-180'}`} />
            </Button>
          </div>

          {/* Close button at top - Mobile only */}
          <div className="flex md:hidden items-center justify-between border-b border-border p-3">
            <h2 className="text-sm font-semibold">Chat History</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggle(false)}
              className="h-9 w-9"
              aria-label="Close sidebar"
            >
              <PanelLeftIcon className="h-5 w-5" />
            </Button>
          </div>

          {/* Chat history list - always visible on mobile when sidebar open, desktop depends on isOpen */}
          {isOpen && (
            <div className="flex-1 overflow-y-auto p-2">
              <div className="mb-2 px-2 py-1 hidden md:block">
                <h2 className="text-sm font-semibold text-muted-foreground">Chat History</h2>
              </div>
              {chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <MessageSquareIcon className="mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">No chat history yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {chats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent ${
                        currentChatId === chat.id
                          ? 'bg-accent'
                          : ''
                      }`}
                      onClick={() => onSelectChat(chat.id)}
                    >
                      <MessageSquareIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

                      <div className="flex-1 overflow-hidden">
                        <div className="truncate text-sm font-medium">
                          {chat.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimestamp(chat.updatedAt || chat.timestamp)}
                        </div>
                      </div>

                      {/* Delete button - shows on hover */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDeleteClick(e, chat.id)}
                        className="h-7 w-7 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Delete chat"
                      >
                        <TrashIcon className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* New Chat Button - Desktop: only when open, Mobile: always visible when sidebar open */}
          {isOpen && (
            <div className="border-t border-border p-3">
              <Button
                onClick={onNewChat}
                className="w-full gap-2"
                variant="default"
              >
                <SquarePenIcon className="h-4 w-4" />
                <span>New Chat</span>
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Overlay - shown when sidebar is open on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => onToggle(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
