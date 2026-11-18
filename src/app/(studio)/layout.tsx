import { WorkspaceBoundary } from '@/features/workspace/context';
import { WorkspaceTabBar } from '@/features/workspace/tab-bar';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkspaceTabBar />
      <WorkspaceBoundary>{children}</WorkspaceBoundary>
    </>
  );
}
