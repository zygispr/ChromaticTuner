# Specification Quality Checklist: Tuner UX Refinements

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-03
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs)
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous
- [X] Success criteria are measurable
- [X] Success criteria are technology-agnostic (no implementation details)
- [X] All acceptance scenarios are defined
- [X] Edge cases are identified
- [X] Scope is clearly bounded
- [X] Dependencies and assumptions identified

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria
- [X] User scenarios cover primary flows
- [X] Feature meets measurable outcomes defined in Success Criteria
- [X] No implementation details leak into specification

## Notes

Two iterations were needed.

**Iteration 1 — implementation details leaked into three requirements.** The first draft named the
mechanism rather than the behaviour: it specified that dismissal compare the press-down and press-up
targets, that the mobile sheet stop using a slide-animated modal container, and that the reference badge
take a 1px border. All three are plan-level decisions. FR-046, FR-050 and FR-053 now state the required
behaviour and leave the mechanism to `/speckit-plan`.

**Iteration 2 — two success criteria were not measurable.** "The sheet closes predictably" and "the badge
looks like a button" restated the user stories rather than defining a threshold. Replaced by SC-017 (zero
unintended dismissals across the pointer-input matrix) and SC-018 (unfamiliar users identify the control
without prompting).

**Numbering deviates from the template on purpose.** Requirements start at FR-036 and success criteria at
SC-016, continuing `001-chromatic-guitar-tuner` rather than restarting. This project cites requirement
numbers from code comments and from `contracts/`, so a second FR-005 with different meaning would corrupt
references that already exist in the codebase.

**Iteration 3 — the first attempt at that continuation collided anyway.** The spec was written starting at
FR-034/SC-014 on the assumption that `001` ended at FR-033/SC-013. It ends at **FR-035/SC-015**. The
collision was live: `001`'s FR-034 is the wake-lock requirement cited at `session.ts:353`, FR-035 is the
audio-focus requirement cited at `session.ts:126`, and SC-014 is the failure-state criterion cited at
`session.ts:154`. Caught during `/speckit-plan` while reading `session.ts`, and renumbered to FR-036+ and
SC-016+ before any downstream artifact referenced the wrong numbers. Worth recording because the defect
mechanism is exactly the one the continuation policy exists to prevent — the policy was right and the
arithmetic was wrong, which is the harder failure to notice.

**Six assumptions are recorded rather than raised as clarifications.** The two worth a second look before
planning are the 2-second stale threshold (US2) and the decision that a stale reset clears the note name
and cents readout as well as the marker. Both are stated in the Assumptions section and are cheap to
change; neither blocks planning.
