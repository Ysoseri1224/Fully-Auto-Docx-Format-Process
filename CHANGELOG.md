# Changelog

## 0.1.0

- Initial public scaffold for `WriteMaster`
- Shared Node core extracted from the current review pipeline (`review.js`, `build.js`)
- CLI entry added as `writemaster`
- Multi-master registry with `review-master` (default) and `chapter10-monograph`
- `--master-id <id>` and `--master <file>` for custom/override master selection
- `--extract <file>` hidden dev mode for DOCX structure extraction
- Single-file Node bundle with dual embedded masters (`npm run bundle`)
- Electron desktop shell upgraded to Workbench-style three-view layout
- Electron "apply task" view fully functional (md + docx modes)
- Electron "template extract" view: upload master → block preview → right-click semantic role assignment → auto-cluster → generate profile
- Electron "profile config" view: list / edit style mapping / import / export / delete profiles
- Electron right-side Inspector with JSON / styles / profile panels + summary tabs
- Electron recent files tracking in sidebar
- Electron portable build (`WriteMaster-portable-0.1.0.exe`, ~84MB)
- DOCX structure extractor (`extract.js`): paragraph/table extraction, format fingerprinting, style clustering
- Profile-driven review pipeline: `processReview` accepts optional profile for custom style mappings
- Rust CLI wrapper with clap, forwarding `--master-id` and `--extract` flags
- 10 new IPC channels for extraction, profile CRUD, clustering, and profile-driven execution
