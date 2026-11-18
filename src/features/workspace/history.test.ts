import { afterEach, expect, it, vi } from 'vitest';
import { replaceWorkspaceLocation } from './history';

const serverReplace = vi.fn();
const historyReplace = vi.fn();
const fullReplace = vi.fn();
function location(online: boolean) {
  vi.stubGlobal('navigator', { onLine: online });
  vi.stubGlobal('window', {
    location: { pathname: '/cv/one', search: '?tab=design', hash: '', replace: fullReplace },
    history: { state: { next: 'existing' }, replaceState: historyReplace },
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it.each([false, true])('updates only the tab marker locally while online=%s', (online) => {
  location(online);
  replaceWorkspaceLocation('/cv/one?tab=design&_workspace=tab-a', serverReplace);
  expect(historyReplace).toHaveBeenCalledWith(null, '', '/cv/one?tab=design&_workspace=tab-a');
  expect(serverReplace).not.toHaveBeenCalled();
  expect(fullReplace).not.toHaveBeenCalled();
});
it('uses the cached full page for a different offline destination', () => {
  location(false);
  replaceWorkspaceLocation('/cv/two?_workspace=tab-b', serverReplace);
  expect(fullReplace).toHaveBeenCalledWith('/cv/two?_workspace=tab-b');
  expect(serverReplace).not.toHaveBeenCalled();
});
it('keeps normal server navigation online when the destination changes', () => {
  location(true);
  replaceWorkspaceLocation('/cv/two?_workspace=tab-b', serverReplace);
  expect(serverReplace).toHaveBeenCalledWith('/cv/two?_workspace=tab-b');
  expect(historyReplace).not.toHaveBeenCalled();
});
