# Domain docs

This repo uses a single-context layout: `CONTEXT.md` at the repo root and decisions in `docs/adr/`.

## Before exploring

Read the root `CONTEXT.md` and ADRs in `docs/adr/` that touch the area you are about to work in.

If these files are absent, proceed silently. The `domain-modeling` skill creates them when domain terms or decisions are resolved.

## Use the glossary vocabulary

When naming domain concepts in issues, proposals, hypotheses, or tests, use the terms defined in `CONTEXT.md`.

If a needed concept is missing, reconsider whether the project uses that term. Record real gaps for `domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, identify the ADR and explain why the decision should be reopened.
