# [PR] Add Structured Traceable Logging, Fix Date Mutation, and Eliminate Silent Discards in OPMET Ingestion Pipeline

## Description
Closes #1 (https://github.com/satrijo/opmet-extractor/issues/1)

This Pull Request introduces comprehensive structured logging across the entire OPMET extraction and ingestion pipeline (`src/opmet.js`, `src/send.js`, `src/idop.js`, `src/wa.js`, `src/index.js`), resolves silent data drop points, fixes cross-line date corruption in multi-station TAF bulletins, and adds an automated unit test suite (`test-suite.js`).

### Background / Problem
Previously, bulletin messages for several Indonesian stations (e.g. `WIMP`, `WIJJ`, `WIJB`, `WAWB`, `WAWD`, `WAWR`, `WAJI`) were delivered to the IDOP API but intermittently missing from the MySQL database. Because database errors were not logged with station context and multiple `return;` filters discarded lines silently, diagnosing discrepancies was impossible. Additionally, uncaught errors in cron schedules caused fatal `ReferenceError: res is not defined` crashes.
---

## Key Changes

### 1. `src/send.js` (Core Ingestion & Database Flow)
- **Traceable Logging for Every Drop / Skip Guard:**
  - `[WARN:DROP]`: Explicitly logged when reports are dropped due to missing `=` delimiter, `WIIX` regional code, or `KW*` / `K*` international filters with raw line text.
  - `[INFO:SKIP]`: Logged when reports are skipped due to `NIL` status.
- **Database Observability:**
  - `[DB:START]`: Logs table, station (ICAO), generated `data_code`, and validity ranges before query execution.
  - `[DB:SUCCESS]`: Distinguishes between new records (`INSERTED`, `affectedRows: 1`) and existing duplicate overwrites (`UPDATED_DUPLICATE`, `affectedRows: 2`).
  - `[DB:ERROR]`: Logs detailed error messages, target station, and query values on failure.
- **Fixed Shared Date Mutation in TAF Parser:**
  - Replaced bulletin-scoped `year` and `month` mutation with line-scoped `yearLine` and `monthLine` to prevent month-rollover state from corrupting subsequent sibling stations in the same bulletin.
- **IDOP & WhatsApp Correlation Logging:**
  - Added `[IDOP:TRIGGER]`, `[IDOP:RESPONSE]`, `[IDOP:ERROR]`, `[WA:TRIGGER]`, and `[WA:RESPONSE]` logs.

### 2. `src/opmet.js` (File Ingestion & Cleansing)
- Added structured logs: `[FILE:READ]`, `[FILE:EXTRACT]` (displaying raw vs cleansed group counts), and `[FILE:ARCHIVE]`.
- Added directory existence safety checks before `readdirSync`.
- Wrapped `fs.renameSync` with `try/catch` error logging to prevent file moving issues from crashing the ingestion loop.

### 3. `src/index.js` (Scheduler & Lifecycle)
- Removed `res.status(500).json(...)` from `cron.schedule` error handler to eliminate fatal `ReferenceError: res is not defined` crashes.
- Added `[CRON]` cycle completion and error tracking.

### 4. `src/idop.js` & `src/wa.js` (External Integrations)
- Replaced `if (error) throw new Error(error)` in asynchronous request callbacks with non-crashing structured error logs (`[IDOP:ERROR]`, `[WA:ERROR]`).

### 5. `test-suite.js` & `package.json` (Automated Testing)
- Added automated unit test suite covering:
  - Multiline TAF combining logic.
  - Parsing and routing verification for target Indonesian stations (`WIMP`, `WIJJ`, `WIJB`, `WAWB`, `WAWD`, `WAWR`, `WAJI`).
  - Drop / skip condition traceability (`MISSING_EQUAL_DELIMITER`, `FOREIGN_NIL`).
  - End-of-month date rollover calculations (31st to 1st).
- Added `"test": "node ./test-suite.js"` to `package.json`.

---

## Verification & Test Results

The automated test suite runs via `npm test` and passes with **0 errors**:

```text
Running Unit Tests for OPMET Extractor Pipeline...
✓ Test 1 Passed: Multiline TAF combining
✓ Test 2 Passed: 7 Target Indonesian Stations (WIMP, WIJJ, WIJB, WAWB, WAWD, WAWR, WAJI) parsed and routed
✓ Test 3 Passed: Rejection and skip events recorded accurately
✓ Test 4 Passed: Month rollover date calculation (31st to 1st) verified

ALL AUTOMATED TESTS PASSED SUCCESSFULLY! 🎉
```

---

## Checklist
- [x] All database operations log query start, success (with insert/update status), and error details.
- [x] Every dropped or skipped line outputs an actionable warning log with station ICAO and raw text.
- [x] Multi-line TAF date rollover does not mutate timestamps for subsequent lines.
- [x] Cron error handler does not crash on `res.status()`.
- [x] External request errors in `idop.js` and `wa.js` do not crash the Node.js runtime.
- [x] Unit test suite added and passing (`npm test`).
- [x] Related issue documented in `issue.md`.
