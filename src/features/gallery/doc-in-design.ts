import { inTheme } from '@/modules/design/themes';
import { PHOTO_FOR, withPhoto } from '@/modules/resume/fixtures';
import { ops } from '@/modules/resume/ops';
import type { DesignId, ResumeDocument } from '@/modules/resume/schema';

/** The CV in a design and colour theme (a sample CV also gets a sample photo). */
export function docInDesign(
  base: ResumeDocument,
  id: DesignId,
  theme: string,
  sample?: string,
): ResumeDocument {
  const withPic = sample ? withPhoto(base, PHOTO_FOR[sample] ?? 'a') : base;
  return inTheme(ops.useDesign(withPic, id), theme === 'own' ? undefined : theme);
}
