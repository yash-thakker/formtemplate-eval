# Fixtures

Each fixture is a directory under `fixtures/` whose name is the fixture id (e.g., `001-osha-incident-report`). It must contain:

| File | Purpose |
| --- | --- |
| `input.pdf` | The blank form PDF to extract from. |
| `expected.json` | The ground-truth `ExtractedTemplate`. Must validate against the Zod schema in `src/schema.ts`. |
| `meta.json` | Fixture metadata (id, name, optional `queries` for Textract Queries, optional `language` for Sarvam). |

Directories whose name starts with `_` or `.` are ignored (e.g., `_template/`).

## Adding a fixture

1. Create `fixtures/<id>/`.
2. Copy your PDF to `input.pdf` and write the ground-truth template to `expected.json`.
3. Copy `_template/meta.json` and fill in `id` + `name` (and `queries` if you intend to benchmark `textract-queries`).
4. Run `pnpm eval validate-fixture --id <id>` to sanity-check the JSON.
5. Run `pnpm eval list` to confirm it's discovered.

## meta.json reference

```json
{
  "id": "001-osha-incident",
  "name": "OSHA Form 300 Incident Report",
  "notes": "Single-page, mostly tabular",
  "language": "en",
  "queries": [
    { "alias": "EMPLOYEE_NAME", "text": "What is the employee's full name?" },
    { "alias": "INCIDENT_DATE", "text": "What is the date of the incident?" }
  ]
}
```

`queries` is only required for the `textract-queries` adapter; other adapters ignore it.
