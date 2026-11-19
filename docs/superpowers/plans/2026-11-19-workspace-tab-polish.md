# Workspace Tab Navigation Refresh

Approved in conversation on November 19, 2026. Base: latest origin/main, initially b1f6636.

## Design and constraints

Use a softly framed rail in the existing cream and teal palette, rounded 44px-high tabs,
subtle elevation for the active tab, stable label widths, and separate menu/close controls.
Keep New workspace and Reopen outside the horizontally scrolling list. Use 120ms micro
feedback and 200ms selection/entrance/reorder motion with the studio easing and reduced-motion
support. Reveal selected tabs horizontally without scrolling the page. Menus must escape
the scroll container.

Drag the label area: mouse threshold 8px; touch delay 250ms, tolerance 5px. Ordinary swipes
scroll; a valid drop reorders, Escape or dropping outside cancels. Suppress clicks after drag.
Provide Move left/right menu actions, focus restoration, and position announcements.

Rename inline through the tab menu or F2. Enter and valid blur save; Escape and blank blur
cancel; blank Enter displays an error; IME composition must not submit. Names are trimmed,
1–64 characters, Unicode is supported, duplicates are allowed, and custom text is never
translated. Custom names survive navigation, background completion, reload, and reopening.
Reset name restores the translated automatic destination title.

Retain main's eight-tab limit, feature switch, account-scoped sessionStorage, existing draft
semantics, and ready indicators. Rename/reorder must preserve tab IDs and active identity and
must never navigate, remount pages, clear drafts, or overwrite newer background results.
No backend changes, new dependencies, or synchronization across windows.

## Implementation tasks

1. Extend the pure tabs model with optional customTitle, rename and reorder operations, and
   backward-compatible parsing. Add regressions first and verify red/green.
2. Implement the rail, isolated tab item, portalled action menu, inline naming, and horizontal
   sortable interactions. Commit metadata against the latest state and scope transient UI to
   the signed-in account. Preserve names in recently closed entries.
3. Extend browser acceptance tests for rename/reset/cancel/IME, pointer and touch dragging,
   non-drag moves, overflow, persistence, independent drafts, background completion, focus,
   German UI, reduced motion, and narrow/zoomed layouts. Run against the unmodified strip
   first where feasible, then verify the implementation.
4. Run npm run verify, affected desktop/mobile e2e, axe, and screenshot inspection. Obtain
   independent review and resolve material findings before reporting completion.

## Important interfaces

- Tab gains customTitle?: string; title remains the automatic destination title.
- rename(state: TabsState, tabId: string, nameOrNull: string | null): TabsState.
- reorder(state: TabsState, tabId: string, overId: string): TabsState.
- Unknown IDs and unchanged operations preserve the existing state. Invalid restored name
  metadata is ignored without discarding a valid tab or its position.

## Review focus

- Background completion during a drag or inline edit must keep both changes.
- Metadata actions on inactive tabs must not activate/remount or clear their ready status.
- Touch gestures must retain ordinary horizontal scrolling until a held drag activates.
- Menus and editing focus must remain usable at viewport edges and after moving/removing tabs.
- Account changes must discard transient editing, dragging, menu, and recent-close state.
