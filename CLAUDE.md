# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tsogolo Bank: a single-page village savings-and-loans tracker (members, weekly contributions, seed repayment, loans with interest, end-of-cycle payout). No build step, no package.json, no tests, no linter. The app is three static files: `index.html`, `index.css`, `index.js` (ES module, imports Firebase from the gstatic CDN).

## Running

Serve the folder over HTTP (ES modules don't load from `file://`), e.g. `node` static server or `npx http-server`, then open it. Firebase and fonts load from CDNs, so it needs internet. The app talks to the **live** Firestore project (`tsogolo-bank`), so admin actions during manual testing modify real data; viewer mode is read-only and safe.

## Architecture (index.js)

- **Single shared state blob.** All data lives in one JS object `state`, persisted as a JSON string in Firestore doc `bank/state` (`{data: "<json>"}`). `onSnapshot` at the bottom of the file replaces `state` when another device changes it, and migrates older documents by filling missing fields (`seedPaid`, `rules`, `weekAmounts`, `bank`).
- **Mutate-then-save pattern.** Handlers mutate `state` in place, then `await saveState()`, which snapshots for undo, writes to Firestore, and calls `renderAll()`. Never write to Firestore directly or skip `saveState()`, or undo history and rendering break.
- **Undo/redo** (`undoStack`/`redoStack`, `lastSaved`) stores whole-state JSON snapshots (max 50). `undo`/`redo` swap `state` and call `writeState`. History is cleared when a snapshot from another device arrives.
- **Rendering** is string-template `innerHTML` per tab (`renderDash`, `renderMembers`, `renderLoans`, `renderWeekly`, `renderShare`); `renderAll` dispatches to the active tab. Inline `onclick="fn()"` handlers in HTML/templates require each handler to be exported with `window.fn = fn` since the script is a module.
- **Roles.** Admins sign in with Firebase Auth (email + password); a user is an admin only if a doc exists at `admins/{uid}` (created by hand in the Firebase console). `firestore.rules` enforces the same check server-side on every write to `bank/state`; deploy with `firebase deploy --only firestore:rules`. `isAdmin` in the client only controls the UI. Admin-only UI uses the `.ao` class, hidden by `body.viewer .ao`.
- **Rules are data, not constants.** Cycle parameters (contribution, seed amount/due week, active/grace weeks, interest, loan weeks) come from `rules()` which merges `DEFAULT_RULES` with `state.rules`. Never hard-code these values. To keep history consistent, each loan stores its own `rate`, and each week's contribution amount is frozen in `state.weekAmounts` when the week advances (`contribFor(w)`).
- **Cycle model.** `currentWeek` advances manually (`advanceWeek`): missed contributions and unpaid seed (at `seedDueWeek`) become auto-generated loans, and overdue loans roll over into new loans. `rollBackWeek` reverses these by matching loan `note` strings (`"Missed contribution Wk{n}"`, `"Seed repayment due Wk{n}"`, `"Rollover from loan #{id}"`), so changing those note formats breaks rollback, `markPaid`, and `doSeedRepay`. After `activeWeeks`, the grace period allows repayments only.
- **Pool and payout.** `poolTotal() = seed + contributions + interest + bank adjustments`; the Share tab splits it equally, deducts member debts, and refunds overpayments. `state.bank` holds the bank statement balance and a ledger of charges/interest, which feeds the pool and the Dashboard reconciliation card.

## Conventions

- Files use CRLF line endings (`core.autocrlf=true`); normalize before scripted multi-line replacements.
- Avoid emojis in UI text (a previous commit removed them on purpose).
- `index.js` caches the last server state in localStorage for fast start; `saveState`/`undo`/`redo` refuse to write until the first live Firestore snapshot (`serverSynced`) so stale cache never overwrites newer data.

## Rules for the community

-Seed money is K100,000 per cycle.
-Loans are paid back in the 6th week after collection.
-Loan interest is 30%.
-Seed money is to be paid on the first day of the cycle.
-Missing seed money payment date is considered a loan.
-Missing a weekly contribution is considered a loan.
-All members are required to take a minimum of K1,000,000 per cycle. Failure to do so is you are considered to have taken an automatic K1,000,000 loan and will be required to pay K300,000 as interest.
-Allow admin to enter actual balance at the bank.
-Deduct actual issued loans from the the bank balance not automatic loans of missing due dates by seed, missing contributions.
-Allow admin to input bank charge cost to be deducted to bank balance.
