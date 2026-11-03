"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon } from "@/components/icons";
import type { ChatPhase, UiMessage } from "@/hooks/use-chat";
import { MessageItem } from "./message-item";

const NEAR_BOTTOM_PX = 120;

/**
 * Scrollable message column. Follows the stream while the user is at the
 * bottom; if they scroll up to read, it stops following and offers a button.
 */
export function MessageList({ messages, phase }: { messages: UiMessage[]; phase: ChatPhase }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const countRef = useRef(messages.length);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const added = messages.length > countRef.current;
    countRef.current = messages.length;
    // A new message (the user just sent one) always scrolls into view.
    if (added) followRef.current = true;
    if (followRef.current) el.scrollTo({ top: el.scrollHeight, behavior: added ? "smooth" : "auto" });
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    followRef.current = atBottom;
    setShowJump(!atBottom);
  };

  const jump = () => {
    followRef.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="scroll-area h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
          {/* initial={false}: history loaded on mount appears without animating. */}
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} phase={phase} />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showJump && (
          <motion.button
            type="button"
            onClick={jump}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            className="absolute bottom-4 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-surface-2 text-foreground shadow-xl"
            aria-label="Ir para o final"
          >
            <ArrowDownIcon className="size-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
