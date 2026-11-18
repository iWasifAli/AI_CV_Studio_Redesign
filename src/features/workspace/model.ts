/** Only structured-cloneable data belongs in a workspace; request handles live in the controller. */
export type FeatureSnapshot = {
  version: 1;
  value: unknown;
  dirty: boolean;
  updatedAt: number;
  /** Present only for meaningful draft fields; the wrapper supports an undefined baseline. */
  baseline?: { value: unknown };
};
export type WorkspaceTask = {
  id: string;
  status: 'running' | 'complete' | 'error' | 'interrupted';
  startedAt: number;
  message?: string;
};
export type WorkspaceTab = {
  id: string;
  href: string;
  title: string;
  entityKey: string | null;
  features: Record<string, FeatureSnapshot>;
  tasks: Record<string, WorkspaceTask>;
  scroll: Record<string, { top: number; left: number }>;
};
export type WorkspaceSession = {
  version: 1;
  ownerUid: string;
  instanceId: string;
  activeTabId: string;
  tabs: WorkspaceTab[];
  closedTabs: WorkspaceTab[];
  updatedAt: number;
};
export type WorkspaceSnapshot = {
  session: WorkspaceSession;
  persistence: 'saved' | 'saving' | 'error';
  problem: string | null;
  frozen: boolean;
};
export const CLOSED_LIMIT = 10;
export const SAVE_DELAY = 250;
