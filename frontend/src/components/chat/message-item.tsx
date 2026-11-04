"use client";

import { motion } from "motion/react";
import { SparkIcon } from "@/components/icons";
import type { ChatPhase, UiMessage } from "@/hooks/use-chat";
import { errorMessage } from "@/lib/errors";
import { ImageGallery } from "./image-gallery";
import { Markdown } from "./markdown";
import { MemoryNote } from "./memory-note";
import { StreamStatus } from "./stream-status";
import { ThinkingBlock } from "./thinking-block";

const enter = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 320, damping: 30 },
};

export function MessageItem({ message, phase }: { message: UiMessage; phase: ChatPhase }) {
  if (message.role === "user") {
    return (
      <motion.div {...enter} className="flex flex-col items-end gap-2">
        {message.attachments.length > 0 && (
          <div className="w-full max-w-[min(85%,26rem)]">
            <ImageGallery images={message.attachments} />
          </div>
        )}
        {message.content && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-accent/20 bg-accent/12 px-4 py-2.5 text-[0.95rem] leading-relaxed">
            {message.content}
          </div>
        )}
      </motion.div>
    );
  }

  const streaming = message.status === "streaming";
  const waiting = streaming && !message.content && !message.thinking;

  return (
    <motion.div {...enter} className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/20">
        <SparkIcon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        {message.thinking && <ThinkingBlock text={message.thinking} active={streaming && !message.content} />}
        {waiting && <StreamStatus phase={phase} />}
        {message.content && (
          <div className={`markdown ${streaming ? "is-streaming" : ""}`}>
            <Markdown content={message.content} />
          </div>
        )}
        <MessageNote message={message} />
        {!streaming && <MemoryNote memories={message.memories ?? []} />}
      </div>
    </motion.div>
  );
}

function MessageNote({ message }: { message: UiMessage }) {
  let note: { text: string; tone: "muted" | "danger" } | null = null;

  if (message.status === "aborted") note = { text: "Resposta interrompida.", tone: "muted" };
  else if (message.status === "error") note = { text: errorMessage(message.errorCode), tone: "danger" };
  else if (message.doneReason === "length")
    note = { text: "A resposta foi cortada pelo limite de tokens.", tone: "muted" };

  if (!note) return null;
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`mt-2 text-xs ${note.tone === "danger" ? "text-danger" : "text-muted"}`}
    >
      {note.text}
    </motion.p>
  );
}
