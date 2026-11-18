import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceBoundary } from './context';

const current = vi.hoisted(() => ({
  account: { status: 'loading', user: null } as { status: string; user: { uid: string } | null },
  pathname: '/jobs/job-one',
}));
vi.mock('@/features/account/account-context', () => ({ useAccount: () => current.account }));
vi.mock('@/i18n/client', () => ({ useT: () => (s: string) => s }));
vi.mock('./link-menu', () => ({ WorkspaceLinkMenu: () => null }));
vi.mock('next/navigation', () => ({
  usePathname: () => current.pathname,
  useRouter: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
const initializeForm = vi.fn();
function CareerForm() {
  initializeForm(current.account.user?.uid ?? 'visitor');
  return createElement('p', null, 'Career form');
}
function render() {
  return renderToString(createElement(WorkspaceBoundary, null, createElement(CareerForm)));
}
afterEach(() => {
  initializeForm.mockClear();
  current.account = { status: 'loading', user: null };
  current.pathname = '/jobs/job-one';
});
it('does not initialize repository-derived defaults before account resolution, even with tabs off', () => {
  expect(render()).toContain('Loading…');
  expect(initializeForm).not.toHaveBeenCalled();
  current.account = { status: 'signedIn', user: { uid: 'alice' } };
  expect(render()).toContain('Career form');
  expect(initializeForm).toHaveBeenCalledWith('alice');
});
it('allows visitor career tools once signed-out status is known', () => {
  current.account = { status: 'signedOut', user: null };
  expect(render()).toContain('Career form');
  expect(initializeForm).toHaveBeenCalledWith('visitor');
});
it('does not block global public pages on account resolution', () => {
  current.pathname = '/help';
  expect(render()).toContain('Career form');
});
