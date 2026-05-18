# Release Notes

## v0.1.0

首个可公开整理版本，提供同一套核心流程的多入口形态。

### 本版内容

- `writemaster --md <file.md> [name]`
- `writemaster --docx <file.docx> [name]`
- Node review 核心
- Node 单文件 bundle
- Electron 桌面入口
- Rust 包装层代码

### 已完成本地验证

- Node CLI 帮助输出
- Node 单文件 bundle 构建
- CLI smoke 导出
- bundle smoke 导出
- Electron 本地启动

### 当前限制

- Rust build on Windows requires MSVC Build Tools with `link.exe`
- Electron 当前仅验证本地启动，尚未打包安装器
- 当前格式规则仍以现有教材模板与工作流为主要适配目标
