# Quickstart: Validating App Store Listing Optimisation

**Feature**: `004-app-store-listings` · **Date**: 2026-08-05

Validation scenarios **V30–V38**, continuing from `003`'s V29. Each names what it proves, how to run it,
and what a pass looks like. Scenarios marked **manual** cannot be automated honestly (research D8) and
are release gates, not merge gates.

Contract guarantees are cited as **L1–L12** from [contracts/store-listing.md](./contracts/store-listing.md).

---

## Prerequisites

```bash
corepack enable
pnpm install
pnpm build                    # required by V30 and V32 — both read apps/web/dist/index.html
```

For screenshot capture only (V33), which does not run in CI:

- macOS with Xcode and at least one booted iOS simulator
- An Android emulator, `adb` on `PATH`

---

## V30 — The listing gate passes on a correct listing

**Proves**: L1, L2, L4, L5, L6, L7, L8, L9, L11, L12 — the whole automated surface (FR-109–FR-112).

```bash
pnpm build && pnpm verify:listing
```

**Pass**: exits 0 and prints one line per group of checks with counts, e.g.
`fields: 13 ok · claims: 6 corroborated · assets: 9 ok · identity: ok`.

A silent success is a failure of this scenario. The counts are what let a reviewer notice that a field
stopped being checked because it stopped existing.

---

## V31 — Each gate is observed failing, and says what broke

**Proves**: SC-043 and the plan's obligation 1. A gate never seen red is not known to work — this repo
already shipped one assertion that was satisfied by the wrong thing for seven phases.

Four separate runs, each reverted afterwards:

| Break | Expected failure |
| --- | --- |
| Append 8 characters to `stores.ios.subtitle` | Names `stores.ios.subtitle`, its actual count, and the limit 30 |
| Set `stores.android.shortDescription` to `""` | Names the field as empty, not merely "invalid" |
| Delete `listing/assets/feature-graphic-1024x500.png` | Names the missing file and which store requires it |
| Add "supports Drop D" to `stores.ios.description` | Names the matched term **and** the field it appeared in |

**Pass**: all four fail, and each message identifies the specific field or file. Record the four
messages verbatim in `tasks.md`.

**Also run the inverse**, because L5's word-boundary matching is the half most likely to be written
wrong: add a sentence containing `asynchronous` and `accounting` and confirm the gate stays green. A
gate that fires on innocent prose gets muted, and a muted gate protects nothing.

---

## V32 — The listing agrees with what the web page actually says

**Proves**: L7 (FR-094, FR-112), and that the check is not the trivially-passing kind.

```bash
pnpm build && pnpm verify:listing
```

Then verify the check is real, in this order:

1. Edit a claim in `store-listing.json` to something the web page does not say. Gate must fail.
2. Revert. Edit `apps/web/src/content.ts` to remove a corroborating sentence, **rebuild**, and re-run.
   Gate must fail.
3. Revert and rebuild.

**Pass**: both directions fail. Step 2 is the one that matters — if it passes, the check is reading
`content.ts` on both sides and proving a constant equals itself.

---

## V33 — Screenshots capture from the real app and reproduce

**Proves**: L9, L10 (FR-100, FR-101, SC-039). **Not run in CI** — needs macOS, Xcode, and an emulator.

```bash
pnpm listing:screenshots           # boots, sets appearance, launches, captures, verifies dimensions
git status --porcelain listing/assets/screenshots
```

**Pass**: `git status` reports no changes — a clean checkout reproduces the committed files. Every
captured image shows the tuner displaying a note, not an empty or permission-request state.

**Check the appearance switch actually switched.** Compare one light and one dark capture; if they are
byte-identical the switch silently failed and L9's inequality assertion is doing its job.

---

## V34 — The icons are generated, not transcribed

**Proves**: L11 (FR-098), and that D5's finding is actually fixed.

```bash
pnpm build && pnpm listing:assets
git diff --stat apps/web/public listing/assets
```

**Pass**: no diff — generation is deterministic. Then confirm the fix landed:

```bash
grep -nE '#[0-9a-fA-F]{6}|rgb\(|hsl\(' apps/web/public/*.svg listing/scripts/*.mjs
```

**Pass**: no matches. Before this feature the same command finds five literals in
`apps/web/public/icon.svg`, each a hand-copy of a dark-theme token — that is the "before" this scenario
demonstrates against.

---

## V35 — The capture flag is absent from a release build

**Proves**: L12.3, the Complexity Tracking obligation, and FR-113.

Produce a release-configuration bundle, then search it:

```bash
grep -rl "captureAudioSource\|SCREENSHOT" <release bundle output>
```

**Pass**: no matches. `EXPO_PUBLIC_*` values are inlined at build time, so a developer's shell settings
say nothing about the artefact. Assert the artefact.

---

## V36 — The privacy page is served, reachable, and does not break offline

**Proves**: FR-104, D9's two easily-missed registrations, and that FR-030 still holds.

```bash
pnpm build
grep -c "privacy" apps/web/dist/sitemap.xml     # expect ≥ 1
grep -c "privacy" apps/web/dist/sw.js           # expect ≥ 1 — the precache array is hand-maintained
pnpm --filter @chromatic-tuner/web preview --port 4173 &
pnpm --filter @chromatic-tuner/web verify:offline
```

Then, with scripting disabled, request `/privacy.html` and confirm the policy text is already in the
response — a store reviewer must not need to run a script to read a privacy policy.

**Pass**: both greps non-zero, `verify:offline` green, policy text present with scripting off.

The two greps exist because the sitemap function and the precache array are separate hand-edits in
`vite.config.ts`, and that file's own comment records what happens when such a list is maintained by
hand.

---

## V37 — Nothing about the tuner changed

**Proves**: FR-113, SC-044.

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test && pnpm test:coverage
pnpm --filter @chromatic-tuner/mobile test
pnpm test:e2e
```

**Pass**: all green, **and** the diff for this feature modifies no file under `packages/`, no file under
`apps/mobile/src/components/`, and no test anywhere except `apps/web/e2e/metadata.spec.ts` (whose only
change is where it reads its forbidden list from).

That second half is the real assertion. A green suite after a behaviour change proves the suite missed
it; the file list is what proves there was no behaviour change to miss.

---

## V38 — Manual release gates

**Proves**: L3, L10, and the outcomes no repository can assert (SC-036, SC-040, SC-041, SC-045).

Run before submission, not before merge. Record results in `tasks.md`.

| Check | Method | Pass |
| --- | --- | --- |
| Name + short summary readable in isolation (L3, SC-036) | Show both, with no icon or description, to reviewers using the earlier features' human-validation method | They state what the app does and that it is free |
| Icon identifiable (SC-040) | Show `icon-play-512.png` scaled to store-search size among unrelated icons | A majority identify it as a tuner |
| Screenshot legibility (L10, SC-039) | View each at store thumbnail size | The note readout is legible |
| `limits.json` still current | Re-read both stores' published metadata specifications; update the last-checked dates | No limit has tightened below a field's current length |
| Identifier caveat (D3) | Confirm the origin chosen for `VITE_SITE_URL` matches `pro.chromatictuner.app`, **and** that the package name is free in the Play Console | They agree or the mismatch is accepted in writing, and Play accepts the package — both permanent afterwards. Apple is already verified; Play is not |
| Review outcome (SC-041) | Submit | Zero rejections attributable to metadata, privacy declarations, missing assets, or claims |
| Store search (SC-045) | 30 days after publication, search each store for the app's name and for its primary intent term | Returned for its name; on the first page for the intent term |
