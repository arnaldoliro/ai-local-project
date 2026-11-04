import { Suspense, type ReactNode } from "react";
import { ChatHost } from "@/components/chat/chat-host";
import { ConversationsProvider } from "@/components/conversations/conversations-provider";
import { Shell } from "@/components/shell/shell";

/**
 * The chat lives here, not in the pages: it must survive the URL changing
 * from "/" to "/c/<id>" when a new conversation is created (see ChatHost).
 * The pages below only exist so those URLs resolve.
 */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <ConversationsProvider>
      <Shell>
        {/* usePathname() may suspend on dynamic routes (Cache Components). */}
        <Suspense fallback={<div className="flex-1" />}>
          <ChatHost />
        </Suspense>
        {children}
      </Shell>
    </ConversationsProvider>
  );
}
