# Release Notes

## v0.1.0

`WriteMaster` 首个可公开整理版本，目标是把现有教材整理工作流收束为可分发工具。

### Included

- `writemaster --md <file.md> [name]`
- `writemaster --docx <file.docx> [name]`
- Shared Node review core
- Bundled Node single-file build
- Electron shell scaffold
- Rust wrapper scaffold

### Verified Locally

- Node CLI help output
- Node single-file bundle build
- CLI smoke export
- Bundle smoke export

### Known Limitations

- Rust build on Windows requires MSVC Build Tools with `link.exe`
- Electron shell is scaffolded and runnable locally, but not yet packaged as an installer
- The current formatting logic is optimized for the existing textbook workflow and template assumptions
