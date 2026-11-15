# AI CV Studio — Save this job (browser extension)

One click on any job advert opens the job tracker with the advert's address filled in; the studio
reads the advert and saves the job to the person's account (`/jobs?new=1&url=…`).

- **Permissions:** `activeTab` (the current tab's address, only when the button is clicked) and
  `contextMenus` (right-click "Save this job"). No host permissions, no content scripts, nothing
  is read from pages by the extension.
- **Works in:** Chrome, Edge, Brave and other Chromium browsers (Manifest V3).

## Publish (owner)

1. `npm run extension:zip` → `dist/ai-cv-studio-extension.zip`.
2. Chrome Web Store developer dashboard → New item → upload the ZIP.
3. Listing: the description from `manifest.json`, the 128 px icon, two screenshots of the job
   tracker, the privacy page `https://aicvstudio.app/privacy`. Single purpose: "Save a job advert
   to the person's job tracker." Data use: none collected by the extension.
4. Edge Add-ons accepts the same ZIP.

Raise `version` in `manifest.json` before each new upload.
