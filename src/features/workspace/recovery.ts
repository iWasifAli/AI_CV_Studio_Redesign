import type { BackupFile } from '@/modules/storage/repository';
import type { WorkspaceSession } from './model';
import { saveBlob } from '@/lib/save-blob';

/** Includes an importable CV backup, readable draft data, and original selected/uploaded files. */
export async function downloadWorkspaceRecovery(
  sessions: WorkspaceSession[],
  documents: BackupFile,
) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  let nextFile = 0;
  const encode = (value: unknown): unknown => {
    if (value instanceof Blob) {
      const name = typeof File !== 'undefined' && value instanceof File ? value.name : 'download';
      const path = `files/${++nextFile}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      zip.file(path, value.arrayBuffer());
      return { file: path, type: value.type };
    }
    if (value instanceof Map)
      return { map: [...value].map(([key, item]) => [encode(key), encode(item)]) };
    if (value instanceof Set) return { set: [...value].map(encode) };
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
    return value;
  };
  zip.file('cv-backup.json', JSON.stringify(documents, null, 2));
  zip.file('workspace-drafts.json', JSON.stringify(encode(sessions), null, 2));
  zip.file(
    'README.txt',
    'CV Studio recovery copy\n\nImport cv-backup.json from Documents to recover CVs. workspace-drafts.json contains the text and settings from your app tabs; uploaded files and completed downloads are in files/.\n\nDownloading this copy does not discard your work or sign you out. An unresponsive window may have newer work: return to that window to export it.\n',
  );
  saveBlob(
    await zip.generateAsync({ type: 'blob' }),
    `cv-studio-recovery-${new Date().toISOString().slice(0, 10)}.zip`,
  );
}
