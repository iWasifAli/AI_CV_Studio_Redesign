'use client';

import type { JobFromUrl } from '@/modules/jobs/from-url';
import type { Insights } from '@/modules/jobs/insights';
import type { Job, JobInput } from '@/modules/jobs/schema';
import type { JobBoardMove, JobBoardResult, JobBoardState } from '@/modules/jobs/board';
import type { ResumeDocument } from '@/modules/resume/schema';

/** Browser helpers for the job tracker API. Errors carry the server's plain-language message. */
export class JobsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
    readonly details?: ConflictDetails,
  ) {
    super(message);
  }
}

/** Conflict payloads vary by operation: a record, a patch or an AI artifact. */
export type ConflictDetails = {
  current?: unknown;
  generated?: unknown;
  reason?: string;
  [key: string]: unknown;
};
export type WorkspaceRequestOptions = {
  ownerUid?: string | null;
  signal?: AbortSignal;
  expectedRevision?: number;
  idempotencyKey?: string;
};

export function workspaceRequest(
  init: RequestInit,
  options: WorkspaceRequestOptions = {},
): RequestInit {
  options.signal?.throwIfAborted();
  const headers = new Headers(init.headers);
  if (options.ownerUid) headers.set('X-Workspace-Owner', options.ownerUid);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  let body = init.body;
  if (body || options.expectedRevision !== undefined) {
    headers.set('content-type', 'application/json');
    if (options.expectedRevision !== undefined) {
      body = JSON.stringify({
        ...(body ? JSON.parse(String(body)) : {}),
        expectedRevision: options.expectedRevision,
      });
    }
  }
  return { ...init, headers, body, signal: options.signal ?? init.signal };
}

export async function workflowCall<T>(
  path: string,
  init: RequestInit = {},
  options: WorkspaceRequestOptions = {},
): Promise<T> {
  const r = await fetch(path, { cache: 'no-store', ...workspaceRequest(init, options) });
  const j = (await r.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error: { message: string; reason?: string; details?: ConflictDetails } }
    | null;
  options.signal?.throwIfAborted();
  if (!r.ok || !j || ('error' in j && j.error))
    throw new JobsError(
      (j && 'error' in j && j.error?.message) || 'That didn’t work. Please try again.',
      r.status,
      (j && 'error' in j && (j.error?.details?.reason ?? j.error?.reason)) || undefined,
      (j && 'error' in j && j.error?.details) || undefined,
    );
  return j as T;
}
const call = workflowCall;

export const jobsApi = {
  /** R9.10 application results. */
  insights: (options?: WorkspaceRequestOptions) =>
    call<{ insights: Insights; total: number }>('/api/jobs/insights', {}, options),
  list: (options?: WorkspaceRequestOptions) =>
    call<{ jobs: Job[]; max: number; board?: JobBoardState }>('/api/jobs', {}, options),
  move: (input: JobBoardMove, options?: WorkspaceRequestOptions) =>
    call<JobBoardResult>(
      '/api/jobs/board/move',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      options,
    ),
  get: (id: string, options?: WorkspaceRequestOptions) =>
    call<{ job: Job }>(`/api/jobs/${id}`, {}, options).then((r) => r.job),
  create: (input: JobInput, options?: WorkspaceRequestOptions) =>
    call<{ job: Job }>('/api/jobs', { method: 'POST', body: JSON.stringify(input) }, options).then(
      (r) => r.job,
    ),
  /** R9.6 reminders on a job. */
  addReminder: (
    id: string,
    input: { on: string; note: string; tz: string },
    options?: WorkspaceRequestOptions,
  ) =>
    call<{ job: Job }>(
      `/api/jobs/${id}/reminders`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      options,
    ).then((r) => r.job),
  updateReminder: (
    id: string,
    rid: string,
    patch: { done?: boolean; note?: string },
    options?: WorkspaceRequestOptions,
  ) =>
    call<{ job: Job }>(
      `/api/jobs/${id}/reminders/${rid}`,
      {
        method: 'PUT',
        body: JSON.stringify(patch),
      },
      options,
    ).then((r) => r.job),
  removeReminder: (id: string, rid: string, options?: WorkspaceRequestOptions) =>
    call<{ job: Job }>(`/api/jobs/${id}/reminders/${rid}`, { method: 'DELETE' }, options).then(
      (r) => r.job,
    ),
  /** R9.5: the job read from its advert page (not saved). */
  fromUrl: (url: string, options?: WorkspaceRequestOptions) =>
    call<{ job: JobFromUrl }>(
      '/api/jobs/fetch',
      {
        method: 'POST',
        body: JSON.stringify({ url }),
      },
      options,
    ).then((r) => r.job),
  /** The job read from advert text the person pasted (title, company, place; nothing fetched). */
  fromText: (text: string, url = '', options?: WorkspaceRequestOptions) =>
    call<{ job: JobFromUrl }>(
      '/api/jobs/fetch',
      {
        method: 'POST',
        body: JSON.stringify({ text, url }),
      },
      options,
    ).then((r) => r.job),
  update: (id: string, patch: Partial<JobInput>, options?: WorkspaceRequestOptions) =>
    call<{ job: Job }>(
      `/api/jobs/${id}`,
      { method: 'PUT', body: JSON.stringify(patch) },
      options,
    ).then((r) => r.job),
  remove: (id: string, options?: WorkspaceRequestOptions) =>
    call<{ ok: true }>(`/api/jobs/${id}`, { method: 'DELETE' }, options),
};

/** AI helpers for one job. `document` is the CV (or career profile) the person chose. */
export const jobAiApi = {
  match: (id: string, document: ResumeDocument, options?: WorkspaceRequestOptions) =>
    call<{ job: Job }>(
      `/api/jobs/${id}/match`,
      {
        method: 'POST',
        body: JSON.stringify({ document }),
      },
      options,
    ).then((r) => r.job),
  tailor: (id: string, document: ResumeDocument, options?: WorkspaceRequestOptions) =>
    call<{ document: ResumeDocument; findings: number }>(
      `/api/jobs/${id}/tailor`,
      {
        method: 'POST',
        body: JSON.stringify({ document }),
      },
      options,
    ),
  letter: (
    id: string,
    document: ResumeDocument,
    tone: 'warm' | 'formal',
    options?: WorkspaceRequestOptions,
  ) =>
    call<{ job: Job; findings: number }>(
      `/api/jobs/${id}/letter`,
      {
        method: 'POST',
        body: JSON.stringify({ document, tone }),
      },
      options,
    ),
  kit: (
    id: string,
    document: ResumeDocument,
    tone: 'warm' | 'formal',
    options?: WorkspaceRequestOptions,
  ) =>
    call<{ document: ResumeDocument; job: Job; findings: number }>(
      `/api/jobs/${id}/kit`,
      {
        method: 'POST',
        body: JSON.stringify({ document, tone }),
      },
      options,
    ),
  brief: (id: string, document: ResumeDocument, pages: string, options?: WorkspaceRequestOptions) =>
    call<{ job: Job }>(
      `/api/jobs/${id}/brief`,
      {
        method: 'POST',
        body: JSON.stringify({ document, pages }),
      },
      options,
    ).then((r) => r.job),
  mockTurn: (
    id: string,
    document: ResumeDocument,
    opts: { answer?: string; restart?: boolean } = {},
    options?: WorkspaceRequestOptions,
  ) =>
    call<{ job: Job }>(
      `/api/jobs/${id}/interview/turn`,
      {
        method: 'POST',
        body: JSON.stringify({ document, ...opts }),
      },
      options,
    ).then((r) => r.job),
  interview: (id: string, document: ResumeDocument, options?: WorkspaceRequestOptions) =>
    call<{ job: Job }>(
      `/api/jobs/${id}/interview`,
      {
        method: 'POST',
        body: JSON.stringify({ document }),
      },
      options,
    ).then((r) => r.job),
  async letterPdf(
    id: string,
    document: ResumeDocument,
    options?: WorkspaceRequestOptions,
  ): Promise<Blob> {
    const r = await fetch(
      `/api/jobs/${id}/letter/pdf`,
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
