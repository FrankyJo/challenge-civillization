# Data, historical research, and AI proposal pipeline

## Content pack contract

Every historical content pack is immutable and versioned. Items include a stable ID, schema version, domain/theme, title, description, applicable year range, geography/culture scope, prerequisites, resource and institution requirements, effects, diffusion model, confidence, source records, review status, and tests/calibration fixtures.

Source records store title, author/institution, URL or bibliographic locator, publication/access dates, source type, relevant claim summary, license/usage notes, and an archived checksum when permitted. Prefer scholarly/primary institutional sources; record disagreement and uncertainty instead of forcing false precision.

## Proposal states

`draft → schema_validated → evidence_reviewed → domain_reviewed → simulated → approved → promoted`

Any rejection returns to draft with structured findings. Promotion signs the content pack, records reviewer identities/roles, creates a changelog, and never mutates an already-used pack.

## AI boundary

LLM outputs are untrusted text/data. The system must:

1. provide a bounded research question and explicit output schema;
2. require claim-level source references and uncertainty;
3. reject unknown fields and invalid identifiers;
4. verify URLs/citations and quoted claims independently;
5. run domain validators for chronology, prerequisites, units, and effect bounds;
6. execute sandbox simulations and regression/calibration tests;
7. require human approval for promotion;
8. preserve prompt, model/provider, timestamps, inputs, outputs, validation results, and costs.

Prompt text, web content, documents, and proposal fields are untrusted data and may contain prompt injection. Research agents may not change code, secrets, approvals, or production state.

## Archive generation

Archive jobs receive only selected ledger events, aggregates, entity facts, and definitions. Generated prose must attach support IDs to every factual paragraph and numeric claim. A verifier checks that numbers equal supplied data, entities exist, chronology is valid, uncertainty is represented, and no unsupported causal claim appears. Editors may approve, edit with evidence, or reject. The raw source packet and article version remain preserved.

## Name datasets

Name entries use normalized script, display form, culture/language/region, era interval, usage category, grammatical/sex/gender applicability where known, frequency weight, source/license, and uncertainty. Generation uses deterministic weighted sampling and configurable uniqueness. Transliteration is a separate display layer; the original form is retained.

## Data governance

Never ingest subscriber identities. Minimize admin personal data, encrypt secrets, log privileged actions, and define deletion/retention for non-historical operational data. Public exports exclude private notes, credentials, raw prompts containing secrets, and vulnerable-person information not appropriate for publication.
