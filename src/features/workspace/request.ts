/** Task ownership is captured once; it must never follow a later account switch. */
const owners = new WeakMap<AbortSignal, string>();

export function registerWorkspaceSignal(signal: AbortSignal, uid: string): void {
  const previous = owners.get(signal);
  if (previous !== undefined && previous !== uid)
    throw new Error('A workspace signal cannot change owners.');
  owners.set(signal, uid);
}

/** Fetch with the originating task's owner assertion, never a live account lookup. */
export async function workspaceFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : undefined;
  const signal = init?.signal === undefined ? request?.signal : init.signal;
  signal?.throwIfAborted();
  const headers = new Headers(init?.headers ?? request?.headers);
  const base = typeof location !== 'undefined' ? location.href : 'https://workspace.invalid/';
  const url = new URL(request?.url ?? String(input), base);
  if (url.origin === new URL(base).origin) {
    const owner = signal ? owners.get(signal) : undefined;
    if (owner !== undefined) headers.set('X-Workspace-Owner', owner);
  } else {
    headers.delete('X-Workspace-Owner');
  }
  const response = await fetch(input, {
    ...init,
    headers,
    // Fetch can forward custom headers across redirects. Never let an owner assertion escape.
    ...(headers.has('X-Workspace-Owner') ? { redirect: 'error' as const } : {}),
  });
  signal?.throwIfAborted();
  return response;
}
