"use client";

import { memo, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

// Module-level constants: stable references, so memo() can skip re-renders.
// react-markdown does not render raw HTML by default, so model output can't
// inject markup into the page (no XSS through the chat).
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];
const components: Components = {
  pre: CodeBlock,
  a: ({ node: _node, ...props }: ComponentProps<"a"> & { node?: unknown }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
      {content}
    </ReactMarkdown>
  );
});
