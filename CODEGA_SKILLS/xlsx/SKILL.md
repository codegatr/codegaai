---
name: xlsx
description: Use when CODEGA AI reads, edits, summarizes, formats, or creates charts in .xlsx workbooks with pandas and openpyxl.
---

# XLSX Skill

## Mission

Handle Excel workbooks as local-first, privacy-first engineering artifacts:

1. Load `.xlsx` files only from approved CODEGA AI runtime workspaces.
2. Inspect every worksheet with pandas previews and openpyxl workbook metadata.
3. Apply deterministic workbook edits without executing macros or external links.
4. Produce edited `.xlsx` outputs under the CODEGA AI outputs directory.
5. Keep every operation auditable through structured API responses.

## Allowed Runtime Roots

The implementation must confine workbook reads and writes to:

- `DATA_DIR/temp/xlsx`
- `DATA_DIR/outputs/xlsx`

Never read arbitrary user paths directly. Upload first, assign a `workbook_id`, then operate on that id.

## Supported Operations

- `create_sheet`: create a new worksheet with a safe Excel sheet name.
- `update_cell`: write a value to a single cell reference such as `B4`.
- `insert_row` / `delete_row`: mutate rows by 1-based index.
- `insert_column` / `delete_column`: mutate columns by 1-based index.
- `format_range`: apply fill, font, and alignment to a cell or range.
- `add_chart`: add `line`, `bar`, `pie`, or `scatter` charts using openpyxl chart objects.

## API Contract

- `POST /api/files/xlsx/upload`
  - Multipart field: `file`
  - Returns: `workbook_id`, workbook metadata, sheet summaries, preview rows.

- `POST /api/files/xlsx/inspect`
  - Body: `{ "workbook_id": "...", "preview_rows": 20 }`
  - Returns: workbook metadata and per-sheet previews.

- `POST /api/files/xlsx/edit`
  - Body: `{ "workbook_id": "...", "output_name": "report.xlsx", "operations": [...] }`
  - Returns: output path, `/outputs/xlsx/...` URL, applied operations, updated summary.

## Security Rules

- Reject non-`.xlsx` files.
- Reject invalid zip structures before writing uploaded content.
- Reject paths outside allowed runtime roots.
- Never log workbook cell content, API keys, local private paths, or full raw data.
- Keep dependencies lazy-imported so missing spreadsheet packages do not break application startup.
- Return clean user-safe errors for dependency or validation failures.

## Quality Checklist

- Add regression tests for path traversal, upload validation, workbook inspection, edits, and charts.
- Run `npm run check` after desktop-adjacent changes.
- Run Python unit tests for the XLSX route/core contract.
- Run `npm run test:ci` when the change touches agent governance or release-critical paths.

## Future Extensions

- Formula dependency maps.
- Pivot-table aware summaries.
- Multi-sheet report templates.
- PDF export pipeline through a verified renderer.
- Natural-language operation planning through the model router.

