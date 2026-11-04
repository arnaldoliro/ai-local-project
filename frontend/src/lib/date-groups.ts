import type { Conversation } from "./api";

export type ConversationGroup = { label: string; items: Conversation[] };

const DAY = 24 * 60 * 60 * 1000;

/** Buckets conversations (already sorted newest first) by last activity. */
export function groupByDate(conversations: Conversation[], now = new Date()): ConversationGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets: [string, number][] = [
    ["Hoje", startOfToday],
    ["Ontem", startOfToday - DAY],
    ["Últimos 7 dias", startOfToday - 7 * DAY],
    ["Últimos 30 dias", startOfToday - 30 * DAY],
    ["Mais antigas", -Infinity],
  ];

  const groups = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    const time = new Date(conversation.updatedAt).getTime();
    const [label] = buckets.find(([, since]) => time >= since)!;
    groups.set(label, [...(groups.get(label) ?? []), conversation]);
  }

  return buckets
    .filter(([label]) => groups.has(label))
    .map(([label]) => ({ label, items: groups.get(label)! }));
}
