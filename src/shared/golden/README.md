# Golden cases

Each JSON file maps a function name (the TypeScript name) to a list of cases:

```json
{ "args": [ ...arguments ], "out": expected result }
{ "args": [ ...arguments ], "err": "exact user-facing error message" }
```

Both `src/shared/golden.test.ts` (TypeScript) and `src-tauri/crates/core/tests/golden.rs` (Rust port) run every case.
Numbers are compared to 9 decimal places. Keys starting with `_` are comments.

- New case for an existing function: add it to the JSON, nothing else.
- New function: add a runner line to both test files.
- New file: also add it to the file lists at the top of both test files (a test fails until you do).
