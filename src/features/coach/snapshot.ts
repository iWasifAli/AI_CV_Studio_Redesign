import type { CoachThread } from '@/modules/coach/thread';
export type CoachConversation = { thread: CoachThread | null; revision: number };
/** A GET completing after a send/clear must not restore the previous conversation. */
export function newerConversation(
  current: CoachConversation | null,
  incoming: CoachConversation,
): CoachConversation {
  return current && current.revision >= incoming.revision ? current : incoming;
}
