# Specification Quality Checklist: App Icon Coverage

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-15
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

### Validation record

Two iterations were needed.

**Iteration 1 — three failures, all in "no implementation details".**

1. The Context section names files (`apps/mobile/app.config.ts`, `icon.svg`, `submission.md`) and one
   generated artefact by filename. **Kept deliberately, and the checklist item is judged passed on the
   requirements rather than on the evidence.** The request was conditional — "if not added already" —
   so the spec's first job is to answer *what is already added*, and that answer is not statable without
   naming what was inspected. The named paths are confined to the Context section; FR-171 … FR-182 and
   SC-074 … SC-079 name no file, language, framework, or API, and would survive the project being
   rewritten in another stack. This is the same shape `004`'s and `007`'s specs already use.
2. FR-176 originally read "MUST provide a 180×180 PNG touch icon". A pixel size and a file format are a
   solution, and the requirement underneath them is that the tile shows the icon. Rewritten to state the
   outcome and leave the format to the plan, with the constraint recorded under Assumptions instead.
3. FR-174 originally named the adaptive-icon layer structure. Rewritten as "survives a mask of any shape
   the platform may apply", which is the property to test; how the layers are composed is a plan
   decision.

**Iteration 2 — one failure, in "success criteria are measurable".**

SC-075 originally read "the icon is recognisable at small sizes", which is not measurable. Rewritten to
name the judge, the size, the setting and the standard: told apart from an unrelated app, on the user's
own home screen, at the device's smallest rendering, on first look, without reading the label.

**Zero [NEEDS CLARIFICATION] markers.** Four decisions were open and all four had a defensible default
recorded in Assumptions rather than a question: the mark is not redesigned (`004` already specified it,
and the request says "if not added already"); splash screens are out (a different surface, and the
request names icons); notification icons are out (the app sends none — Principle II); and the icon does
not follow device appearance (it matches the artwork both stores already display). None of the four
changes the feature's scope enough to justify blocking on an answer.
