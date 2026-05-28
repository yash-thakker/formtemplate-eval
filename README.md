# Form Extraction Eval

Local benchmark / eval framework for comparing AI extraction pipelines on AEC (architecture / engineering / construction) form PDFs.

Drop in blank-form PDFs and their ground-truth structured templates, point the CLI at them, and get a side-by-side scorecard of every pipeline — Gemini, Claude, GPT, AWS Textract (FORMS / TABLES / LAYOUT / SIGNATURES & QUERIES), Sarvam Document Intelligence, and combined OCR→LLM variants.

> **Status:** local dev tool. Not for production. Output schema, prompts, and pricing are placeholders until calibrated.

## Setup

```bash
pnpm install
cp .env.example .env
# fill in API keys for the providers you want to benchmark
pnpm eval list   # confirms adapters and fixtures are discoverable
```

Requires Node 22+ and pnpm 9+.

## Quick start

```bash
# Run everything
pnpm eval run

# Run a subset
pnpm eval run --adapters gemini-flash,claude-sonnet --fixtures 001-osha,002-aia-g702

# Bypass cache reads (force fresh extraction)
pnpm eval run --no-cache

# View the latest report
pnpm eval show-report

# Compare two runs
pnpm eval compare reports/2026-05-28-150000 reports/2026-05-28-180000
```

## Adapters

| Name | What it does |
| --- | --- |
| `gemini-flash` | Google Gemini 2.5 Flash — PDF → structured template via Vercel AI SDK `generateObject`. |
| `gemini-pro` | Same as above, Gemini 2.5 Pro. |
| `claude-sonnet` | Anthropic Claude Sonnet 4.6, same path. |
| `gpt5` | OpenAI GPT-5, same path. |
| `textract-only` | AWS Textract FORMS + TABLES + LAYOUT + SIGNATURES. Block→template mapping, no LLM. |
| `textract-queries` | AWS Textract Queries. Requires per-fixture queries in `meta.json`. |
| `textract-plus-llm` | Textract OCR → Gemini Flash structuring. |
| `sarvam-only` | Sarvam Document Intelligence markdown → heuristic template (no LLM). |
| `sarvam-plus-llm` | Sarvam markdown → Gemini Flash structuring. |

## Adding a fixture

1. Create `fixtures/<id>/` (e.g. `fixtures/001-aia-g702/`).
2. Drop in `input.pdf` (the blank form) and `expected.json` (your ground-truth `ExtractedTemplate`).
3. Copy `fixtures/_template/meta.json` to `fixtures/<id>/meta.json` and fill in id + name. Add `queries` if you intend to benchmark `textract-queries`.
4. `pnpm eval validate-fixture --id <id>` — confirms `expected.json` matches the Zod schema.
5. `pnpm eval list` — confirms it's discovered.

Directories beginning with `_` or `.` are ignored (e.g., `_template/`).

## Adding an adapter

1. Create `src/adapters/<name>.ts` exporting `const yourAdapter: ExtractionAdapter`.
2. Implement `extract(pdfPath, meta) -> Promise<AdapterResult>`. Time it with `performance.now()`. Compute cost from `PRICING` in `src/config.ts`. Validate output with `ExtractedTemplateSchema.safeParse` and return `result: null` if it fails.
3. Never throw — catch and put the error into `AdapterResult.error`.
4. Register in `src/adapters/index.ts`'s `ALL_ADAPTERS` array.

That's the whole contract. The runner wrapper in `src/adapters/base.ts` handles caching, timeouts, and a safety-net schema check.

## Interpreting the report

Every run writes `reports/<timestamp>/`:

- `results.json` — full benchmark report, machine-readable.
- `report.md` — human-readable markdown with five sections:
  1. **Run metadata** — timestamp, git commit, Node version, fixture/adapter counts, cache state.
  2. **Summary by adapter** — sorted by F1. The headline scorecard.
  3. **Per-fixture detail** — every (fixture, adapter) row with all eight scores.
  4. **Failure analysis** — for each adapter, the 3 fixtures it scored worst on, with the specific fields it missed or hallucinated.
  5. **Cost breakdown** — total cost per adapter and grand total.

The same summary prints to terminal at the end of `pnpm eval run`.

### Score definitions

All scores are 0..1. Higher is better.

| Score | Meaning |
| --- | --- |
| `fieldRecall` | Of expected fields, how many were extracted? |
| `fieldPrecision` | Of extracted fields, how many match an expected field? |
| `fieldF1` | Harmonic mean of recall + precision. The headline number. |
| `typeAccuracy` | Of matched fields, fraction with identical `type`. |
| `sectionAccuracy` | Of matched fields, fraction whose section titles fuzzy-match (≥ 0.7). |
| `labelSimilarity` | Mean normalized Levenshtein similarity of matched label pairs. |
| `requiredAccuracy` | Of matched fields, fraction with identical `required` flag. |

Field matching is a bipartite assignment: extracted fields and expected fields are paired via the Hungarian algorithm using normalized Levenshtein similarity, with a hard floor at 0.6 (configurable in `src/scoring/match-fields.ts`). Anything below the floor is treated as unmatched.

## How caching works

Every adapter run is keyed by `(adapter-name, sha256(pdf))` and persisted to `cache/<adapter>/<hash>.json`. Re-running the same combination reads from cache and finishes in a few seconds, even for slow adapters. Pass `--no-cache` to force fresh runs.

## Limitations

- **Use case 1 only.** This eval is for *template* extraction from blank forms. Filled-form data extraction (Use case 2) is out of scope.
- **PDF only.** Image inputs not handled.
- **Pricing is hand-rolled.** Numbers in `src/config.ts` are best-effort at project start. Confirm provider pricing pages before publishing benchmark results.
- **Levenshtein only.** No embedding-based label similarity. Deterministic and fast; will fail on heavily-paraphrased labels.
- **Sarvam endpoint paths are best-effort.** If Sarvam changes their Document Digitisation URL surface, update only `src/ocr/sarvam.ts`.
