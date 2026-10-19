import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef } from "react";
import {
  CloudSun,
  Send,
  Sparkles,
  Cloud,
  Sun,
  Menu,
  LoaderCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "Hello! I'm your BTP Weather Assistant. Ask me about current weather, forecasts, temperature, or rain chances for any city.",
};

const SUGGESTIONS = [
  { label: "Weather in Lahore", icon: Sun },
  { label: "Forecast for tomorrow", icon: CloudSun },
  { label: "Will it rain today?", icon: Cloud },
];

export default function ChatPage({
  messages,
  conversationId,
  chatLoading,
  chatError,
  message,
  setMessage,
  setMobileSidebarOpen,
  handleSend,
}) {
  const composerInputRef = useRef(null);
  const chatScrollRef = useRef(null);

  // Scroll only the messages pane, never the document or the composer.
  useEffect(() => {
    const scrollArea = chatScrollRef.current;
    if (!scrollArea) return;

    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTo({
        top: scrollArea.scrollHeight,
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, chatLoading, conversationId]);

  // Grow the composer as text is entered, including when a suggestion fills it.
  useEffect(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const maxHeight = 120;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message]);

  const isWelcomeMessage =
    messages.length === 1 &&
    messages[0].role === "assistant" &&
    messages[0].content === WELCOME_MESSAGE.content;

  return (
    <section className="chat-panel">
      <header className="topbar">
        <div className="topbar-heading">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu-button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </Button>
          <div>
            <h1>Weather Chat</h1>
            <p>Ask questions. Understand the weather.</p>
          </div>
        </div>

        <div className="assistant-status">
          <span className="status-dot" />
          <span>AI Assistant</span>
        </div>
      </header>

      <div className="chat-scroll-area" ref={chatScrollRef}>
        <div className="chat-content">
          {isWelcomeMessage && (
            <div className="welcome-heading">
              <div className="welcome-icon">
                <CloudSun size={30} />
              </div>
              <div className="welcome-eyebrow"></div>
              <h2>Your personal weather assistant</h2>
              <p>
                Get current conditions, forecasts, and rain insights through a
                simple conversation.
              </p>
            </div>
          )}

          <div className="messages" aria-busy={chatLoading}>
            {messages.map((item, index) => (
              <div
                className={`message-row ${item.role}`}
                key={`${conversationId || "new"}-${index}`}
              >
                {item.role === "assistant" && (
                  <Avatar className="message-avatar">
                    <AvatarFallback>
                      <CloudSun size={19} />
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="message-bubble">
                  <div className="message-author">
                    {item.role === "assistant" ? "BTP Assistant" : "You"}
                    <span>
                      {item.role === "assistant" ? "AI response" : "Message"}
                    </span>
                  </div>
                  <div className="markdown-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="markdown-table-wrapper">
                            <table>{children}</table>
                          </div>
                        ),
                      }}
                    >
                      {item.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="message-row assistant">
                <Avatar className="message-avatar">
                  <AvatarFallback>
                    <CloudSun size={19} />
                  </AvatarFallback>
                </Avatar>
                <div className="message-bubble loading-bubble">
                  <div className="message-author">BTP Assistant</div>
                  <div
                    className="flex items-center gap-3 py-2"
                    role="status"
                    aria-live="polite"
                    aria-label="Assistant is preparing a response"
                  >
                    <LoaderCircle
                      size={17}
                      className="animate-spin text-primary"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-muted-foreground">
                      Checking the weather...
                    </span>
                    <span
                      className="flex items-center gap-1"
                      aria-hidden="true"
                    >
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                    </span>
                  </div>
                  <div className="space-y-2" aria-hidden="true">
                    <Skeleton className="h-2.5 w-56 max-w-full" />
                    <Skeleton className="h-2.5 w-44 max-w-[85%]" />
                    <Skeleton className="h-2.5 w-32 max-w-[65%]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="composer-area">
        {chatError && (
          <div className="chat-error" role="alert">
            {chatError}
          </div>
        )}

        {isWelcomeMessage && (
          <div className="suggestions">
            {SUGGESTIONS.map(({ label, icon: Icon }) => (
              <button
                type="button"
                className="suggestion"
                key={label}
                onClick={() => setMessage(label)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}

        <form className="composer" onSubmit={handleSend}>
          <Textarea
            ref={composerInputRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask about the weather in any city..."
            aria-label="Your weather question"
            maxLength={2000}
            disabled={chatLoading}
            rows={1}
            className="composer-input"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button
            type="submit"
            className="send-button"
            disabled={!message.trim() || chatLoading}
            aria-label="Send message"
          >
            {chatLoading ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
            <span>Send</span>
          </Button>
        </form>

        <p className="composer-note">
          BTP Weather Assistant · Made a mistakes check imp info.
        </p>
      </div>
    </section>
  );
}
