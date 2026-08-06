# Feature Specification: Settings sheet behaves as a modal dialog

**Feature Branch**: `006-fix-settings-sheet-focus`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "I would like to fix some bugs I noticed with the Settings slideout (found on the web app, investigate if mobile also has same problems): 1. When the slideout is out, the focus when tabbing should be kept in the slideout, it should not be possible to focus on a button outside of the slideout while it is open. 2. It shouldn't be possible to scroll when slideout is displayed. 3. When focus is on the pitch slider and I use an arrow key, the value changes by one Hz and the focus then immediately jumps to the "Done" button. 4. Similarly to 3rd point, when focus is on any of the Accidentals, Appearance or Reset to defaults buttons, when I press space or enter, the button triggers and then the focus immediately jumps to "Done" button

## Overview

The settings sheet presents itself as a modal dialog and is announced as one, but it does not behave like one. Four defects were reported against the web app; all four are reproducible. They share a single user-visible consequence: **the settings cannot be operated from the keyboard.**

This feature is a defect fix. It adds no settings, no controls, and no new user-facing capability. The sheet's appearance, copy, layout, animation, and the three preferences it holds are all unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Changing a setting by keyboard leaves focus where it was (Priority: P1)

A keyboard user opens the settings, tabs to the reference pitch control, and presses the right arrow key to raise A4 from 440 Hz to 441 Hz. The value changes — and focus is immediately taken away from the control and placed on the **Done** button. A second arrow press does nothing to the pitch, because the control that would have received it is no longer focused. The same happens for every other control in the sheet: activating **Sharps**, **Flats**, **Match device**, **Light**, **Dark**, or **Reset to defaults** with Space or Enter moves focus to **Done**.

The practical effect is that every keyboard interaction with the settings costs a re-navigation, and adjusting the reference pitch by more than one step means tabbing back to the slider before each press. Reaching 432 Hz from 440 Hz — the single most common non-standard reference — takes eight arrow presses interleaved with eight re-navigations.

**Why this priority**: This is the defect that makes the feature unusable rather than merely awkward. It affects keyboard users and switch-device users on the primary settings interaction, and it silently discards input (the second and subsequent arrow presses go nowhere the user can see).

**Independent Test**: Open the settings with a keyboard, focus the reference pitch control, press an arrow key twice, and confirm the value moved by two steps and focus is still on the pitch control. Repeat for each button in the sheet, confirming focus remains on the activated button.

**Acceptance Scenarios**:

1. **Given** the settings are open and focus is on the reference pitch control, **When** the user presses an arrow key, **Then** the reference pitch changes by one step and focus remains on the reference pitch control.
2. **Given** the settings are open and focus is on the reference pitch control, **When** the user presses the same arrow key eight times in a row without touching anything else, **Then** the reference pitch has moved by eight steps.
3. **Given** the settings are open and focus is on an accidental option, **When** the user activates it with Space or Enter, **Then** the accidental preference changes and focus remains on that option.
4. **Given** the settings are open and focus is on an appearance option, **When** the user activates it with Space or Enter, **Then** the appearance changes and focus remains on that option.
5. **Given** the settings are open and focus is on **Reset to defaults**, **When** the user activates it with Space or Enter, **Then** all three preferences return to their defaults and focus remains on **Reset to defaults**.
6. **Given** the settings have just been opened, **When** the user has not yet moved focus, **Then** focus is on a control inside the sheet — the existing behaviour, which must survive the fix.

---

### User Story 2 - Focus cannot leave the open sheet (Priority: P2)

A keyboard user opens the settings and presses Tab past the last control in the sheet. Focus leaves the sheet and lands on controls behind the scrim — the reference pitch badge, the microphone toggle, whatever the status banner is offering. Those controls are dimmed and visually unreachable, but they can be focused and activated, so a user can start or stop the microphone, or re-open the settings that are already open, without any indication that they have left the dialog. Shift+Tab from the first control has the same result in the other direction.

When the sheet is closed, focus is not returned to the control that opened it; it is discarded, and the next Tab starts over from the top of the page.

**Why this priority**: The sheet declares itself a modal dialog to assistive technology, so a screen-reader user is told they are in a dialog while their focus wanders outside it. It is a genuine correctness defect, but the sheet does remain operable — Escape and **Done** both work — which places it below User Story 1.

**Independent Test**: Open the settings, press Tab repeatedly past the last control, and confirm focus returns to the first control in the sheet rather than reaching anything behind it. Press Shift+Tab from the first control and confirm the mirror. Close the sheet and confirm focus is back on the control that opened it.

**Acceptance Scenarios**:

1. **Given** the settings are open, **When** the user presses Tab from the last focusable control in the sheet, **Then** focus moves to the first focusable control in the sheet.
2. **Given** the settings are open, **When** the user presses Shift+Tab from the first focusable control in the sheet, **Then** focus moves to the last focusable control in the sheet.
3. **Given** the settings are open, **When** the user presses Tab enough times to cycle past every control in the sheet, **Then** no control outside the sheet is ever focused.
4. **Given** the settings are open, **When** a screen reader is used to move through the page by element, **Then** only the sheet's own content is reachable.
5. **Given** the settings were opened from the reference pitch badge, **When** the user closes them with **Done** or Escape, **Then** focus returns to the reference pitch badge.

---

### User Story 3 - The page behind the sheet does not scroll (Priority: P3)

The tuner page has supporting content below the fold. With the settings open, scrolling — by wheel, trackpad, touch drag on the scrim, or the Page Down / arrow keys — moves the page behind the sheet. The scrim and the sheet stay pinned where they are, so the content visibly slides underneath them and the sheet ends up floating over an unrelated part of the page. On a short viewport the user can scroll the page far enough that the tuner they were adjusting the reference pitch against is no longer on screen at all.

**Why this priority**: Cosmetic and disorienting rather than blocking. Nothing becomes unreachable and no input is lost.

**Independent Test**: Open the settings on a viewport short enough for the page to scroll, attempt to scroll by every available means, and confirm the page's scroll position is unchanged. Close the sheet and confirm scrolling works again from the same position it was at before.

**Acceptance Scenarios**:

1. **Given** the settings are open on a page that can scroll, **When** the user scrolls by wheel, trackpad, or touch on the scrim, **Then** the page's scroll position does not change.
2. **Given** the settings are open, **When** the user presses Page Down, Page Up, Home, End, or an arrow key while no control has focus that consumes it, **Then** the page's scroll position does not change.
3. **Given** the page was scrolled to a position before the settings were opened, **When** the settings are closed, **Then** the page is at that same scroll position and scrolling works normally again.
4. **Given** the settings are open, **When** the user scrolls, **Then** no scrollbar appears or disappears in a way that shifts the width of the content behind the scrim.

---

### Edge Cases

- **A control disappears while the sheet is open.** The persistence warning appears and vanishes on its own; it is not focusable, but any change to the set of focusable controls must not break the cycle in User Story 2. Focus containment must be computed from what is in the sheet at the time of the key press, not from a list captured when the sheet opened.
- **Reset to defaults while focus is on an option that stops being selected.** Reset changes the selected accidental and appearance. The activated control must keep focus (User Story 1) even though its selected state has changed underneath it.
- **The reference pitch is at its minimum or maximum.** An arrow key that cannot move the value further must still leave focus where it is; a no-op change must not be treated differently from a real one.
- **The sheet is closed by clicking the scrim rather than by keyboard.** Focus restoration must still put focus somewhere sensible rather than leaving it discarded, since the user may switch to the keyboard immediately afterwards.
- **The sheet is opened by pointer and then operated by keyboard.** The first Tab must land inside the sheet, not at the top of the page.
- **Scroll restoration on close.** The page must not jump to the top when the sheet closes, and must not be left permanently unable to scroll if the sheet is unmounted by anything other than the close action.
- **Reduced motion.** None of these fixes may introduce movement; the sheet's existing animation behaviour under reduced motion is unchanged.

## Requirements *(mandatory)*

### Functional Requirements

#### Focus stability (User Story 1)

- **FR-132**: Changing any preference from inside the settings MUST NOT move keyboard focus. The control the user acted on MUST still hold focus when the change has been applied.
- **FR-133**: The settings MUST place focus on a control inside the sheet when the sheet opens, and MUST NOT place focus again for as long as the sheet stays open.
- **FR-134**: Repeated presses of the same key on the reference pitch control MUST each move the reference pitch by one step, with no intervening navigation required by the user.

#### Focus containment (User Story 2)

- **FR-135**: While the settings are open, keyboard focus MUST remain within the sheet. Forward navigation past the last control MUST wrap to the first, and backward navigation past the first MUST wrap to the last.
- **FR-136**: While the settings are open, no control outside the sheet MUST be focusable or activatable by keyboard, by pointer, or by assistive technology.
- **FR-137**: The set of controls focus may reach MUST be determined at the time of navigation, so that controls appearing or disappearing while the sheet is open are handled correctly.
- **FR-138**: Closing the settings MUST return focus to the control that opened them, regardless of how the settings were closed.

#### Scroll containment (User Story 3)

- **FR-139**: While the settings are open, the content behind the sheet MUST NOT scroll in response to any user input.
- **FR-140**: Closing the settings MUST restore scrolling, with the page at the same scroll position it held when the settings were opened.
- **FR-141**: Preventing scrolling MUST NOT change the laid-out width of the content behind the scrim.

#### Cross-platform parity

- **FR-142**: The mobile app's settings MUST satisfy the same containment guarantees as the web app: focus and assistive-technology navigation confined to the sheet, no interaction with the tuner behind it, and no scrolling of content behind it.
- **FR-143**: Each guarantee above MUST be covered by an automated regression test on each platform where the platform does not already provide the behaviour natively. Where a platform does provide it natively, that MUST be asserted rather than assumed, so a later change cannot remove it silently.

#### Preservation

- **FR-144**: Every existing settings behaviour MUST be preserved: Escape closes the sheet; **Done** closes the sheet; a press that begins and ends on the scrim closes the sheet; a press with one end inside the sheet does not; and the tuner keeps reading while the reference pitch is adjusted.
- **FR-145**: The sheet's visual appearance MUST be unchanged in both light and dark — no change to layout, spacing, colour, type, or animation.

### Key Entities

Not applicable. This feature stores no data and changes no stored data; the three preferences and their storage record are untouched.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-056**: A keyboard user can move the reference pitch from 440 Hz to 432 Hz using only the arrow keys, in eight key presses and no other input.
- **SC-057**: A keyboard user can set every one of the three preferences and return to the tuner without focus ever landing on a control they did not navigate to.
- **SC-058**: With the settings open, no amount of Tab or Shift+Tab reaches any control outside the sheet — verified by cycling at least twice the number of controls the sheet contains.
- **SC-059**: With the settings open, the page's scroll position is identical before and after attempting to scroll by every available means, and is identical again once the settings are closed.
- **SC-060**: A screen reader announces the settings as a dialog and can reach only the sheet's contents while it is open, on both platforms.
- **SC-061**: Every existing automated test for the settings, its layout stability, and its accessibility continues to pass unchanged.
- **SC-062**: Light and dark screenshots of the sheet are pixel-identical before and after the change.

## Assumptions

- **The four reported defects are the whole of the scope.** Focus restoration on close (FR-138) is included because it is the fifth obligation of the same dialog contract and cannot be tested apart from the other four; it was not separately reported.
- **The mobile app does not exhibit defects 1, 2 and 3/4 today.** Its settings are a native modal over a screen that does not scroll, and nothing in it moves focus. The parity requirements (FR-142, FR-143) are therefore expected to be satisfied by adding assertions rather than by changing behaviour. If the investigation during planning finds otherwise, the fix falls in scope.
- **Physical-keyboard operation of the mobile app is not a supported interaction path**; the mobile parity requirement is about assistive-technology navigation and touch, which are what that platform's users actually have.
- **No new dependency will be introduced for this.** Principle II sets the bar at roughly 30 lines of equivalent hand-written code, and a focus trap for one dialog with a known, small set of controls sits below it.
- **Test-first applies** (Principle III): each defect gets a test that is observed failing against the current code before the fix lands.
- **The sheet keeps its current single-page, no-navigation form.** Nothing here reopens the decision to render settings as a sheet rather than a route.
