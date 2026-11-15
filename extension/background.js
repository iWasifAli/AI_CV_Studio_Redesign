/*
 * AI CV Studio — Save this job (spec §10, browser extension).
 * One click opens the job tracker with the advert's address filled in; the studio reads the
 * advert and saves it to the person's account. The extension reads nothing itself: it only
 * passes the address of the tab (or link) the person chose. Permissions: activeTab (the current
 * tab's address, only when the button is clicked) and contextMenus.
 */
const STUDIO = 'https://aicvstudio.app';

/** Only real web pages can be job adverts. */
function saveable(url) {
  try {
    const u = new URL(url);
    return (
      (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname !== new URL(STUDIO).hostname
    );
  } catch {
    return false;
  }
}

function open(url) {
  const target = saveable(url)
    ? `${STUDIO}/jobs?new=1&url=${encodeURIComponent(url)}&source=extension`
    : `${STUDIO}/jobs?new=1&source=extension`;
  chrome.tabs.create({ url: target });
}

chrome.action.onClicked.addListener((tab) => open(tab.url || ''));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-page',
    title: 'Save this job to AI CV Studio',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'save-link',
    title: 'Save the linked job to AI CV Studio',
    contexts: ['link'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  open(info.menuItemId === 'save-link' ? info.linkUrl || '' : info.pageUrl || tab?.url || '');
});

// For the unit test.
globalThis.__cvStudioExtension = { saveable, STUDIO };
