"use client";

import { AnimatePresence, motion } from "motion/react";
import { isValidElement, useRef, useState, type ComponentProps } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

type Props = ComponentProps<"pre"> & { node?: unknown };

/** Replaces markdown's <pre>: adds the language label and a copy button. */
export function CodeBlock({ children, node: _node, ...props }: Props) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const className = isValidElement<{ className?: string }>(children) ? children.props.className : undefined;
  const language = className?.match(/language-([\w-]+)/)?.[1] ?? "texto";

  const copy = async () => {
    // 127.0.0.1 counts as a secure context, so the Clipboard API is available.
    await navigator.clipboard.writeText(preRef.current?.innerText ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language}</span>
        <button type="button" onClick={() => void copy()} className="code-block-copy" aria-label="Copiar código">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? "ok" : "copy"}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5"
            >
              {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
      <pre ref={preRef} {...props}>
        {children}
      </pre>
    </div>
  );
}
