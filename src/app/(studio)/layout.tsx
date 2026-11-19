import { StudioWorkspace } from '@/features/studio/studio-workspace';
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <StudioWorkspace>{children}</StudioWorkspace>;
}
