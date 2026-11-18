# Job tracker board

The job tracker is a drag-and-drop board with persistent card order. There is one interface; no feature flag.

- Reorder cards within a stage or move them between the five stages with the mouse, touch or keyboard, or use the Actions menu on a card (move to a stage, up or down). On a phone a "Jump to stage" selector scrolls between columns.
- The job's own `stage` stays the truth. Order is presentation only, stored per account at `users/{uid}/jobBoard/main` as `{ revision, columns }`. Jobs without a stored order are placed by most recent update.
- `GET /api/jobs` returns `jobs`, `max` and `board`. `POST /api/jobs/board/move` takes `jobId`, `fromStage`, `toStage`, `beforeId`, `revision` and `expectedJobUpdatedAt`; a stale move returns 409 and the client refreshes before allowing another move. Stage and order commit in one Firestore transaction.
- Job saves (detail, match, letter, kit, brief, interview, reminders) go through `saveJobUpdate`, an atomic update on the latest record, so a slow result cannot overwrite a move or bring back a deleted job.
- Deleting a job removes its place in the order; deleting the account removes the order data.
- Watch `/api/jobs/board/move` status codes and the `job_board_move_failed` log (request id and duration, no job content).
