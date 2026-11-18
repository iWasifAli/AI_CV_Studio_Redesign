'use client';

import {
  JobsError,
  workflowCall as call,
  workspaceRequest,
  type WorkspaceRequestOptions,
} from '@/features/jobs/api';
import type { SavedLetter, SavedLetterInput } from '@/modules/letters/schema';
import type { ResumeDocument } from '@/modules/resume/schema';

export const lettersApi = {
  list: (options?: WorkspaceRequestOptions) =>
    call<{ letters: SavedLetter[]; max: number }>('/api/letters', {}, options),
  get: (id: string, options?: WorkspaceRequestOptions) =>
    call<{ letter: SavedLetter }>(`/api/letters/${id}`, {}, options).then((r) => r.letter),
  create: (input: SavedLetterInput, options?: WorkspaceRequestOptions) =>
    call<{ letter: SavedLetter }>(
      '/api/letters',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      options,
    ).then((r) => r.letter),
  update: (id: string, patch: Partial<SavedLetterInput>, options?: WorkspaceRequestOptions) =>
    call<{ letter: SavedLetter }>(
      `/api/letters/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(patch),
      },
      options,
    ).then((r) => r.letter),
  remove: (id: string, options?: WorkspaceRequestOptions) =>
    call<{ ok: true }>(`/api/letters/${id}`, { method: 'DELETE' }, options),
  draft: (
    id: string,
    document: ResumeDocument,
    tone: 'warm' | 'formal',
    options?: WorkspaceRequestOptions,
  ) =>
    call<{ letter: SavedLetter; findings: number }>(
      `/api/letters/${id}/draft`,
      {
        method: 'POST',
        body: JSON.stringify({ document, tone }),
      },
      options,
    ),
  async pdf(
    id: string,
    document: ResumeDocument,
    options?: WorkspaceRequestOptions,
  ): Promise<Blob> {
    const r = await fetch(
      `/api/letters/${id}/pdf`,
      workspaceRequest(
        {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ document }),
        },
        options,
      ),
    );
    options?.signal?.throwIfAborted();
    if (r.ok) {
      const blob = await r.blob();
      options?.signal?.throwIfAborted();
      return blob;
    }
    const j = (await r.json().catch(() => null)) as {
      error?: { message: string; reason?: string };
    } | null;
    throw new JobsError(
      j?.error?.message ?? 'We couldn’t create the PDF just now.',
      r.status,
      j?.error?.reason,
    );
  },
};
