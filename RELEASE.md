# Release Notes

## v0.1.0

首个可公开整理版本，提供同一套核心流程的四种入口形态（CLI / 单文件 Bundle / Electron 桌面 / Rust 包装）。

### 本版内容

**核心管道：**
- `writemaster --md <file.md> [name]` — Markdown → DOCX（Pandoc + OOXML 后处理）
- `writemaster --docx <file.docx> [name]` — DOCX 整理输出（样式覆盖 + 段落分类 + 编号）
- `--master-id <id>` 多母版选择（`review-master` 默认 / `chapter10-monograph`）
- `--master <file.docx>` 自定义外部母版
- `--extract <file.docx>` 开发用：导出母版结构化 JSON（不显示在 --help）

**Node 核心：**
- `src/core/review.js` — OOXML review 后处理（段落分类、样式应用、SQL 格式化、注释拆分、编号管理、表格重建）
- `src/core/build.js` — md → temp.docx → review.docx 管线
- `src/core/extract.js` — DOCX 结构提取（段落/表格 → 中间模型）、格式聚类、Profile 生成
- `src/cli.js` — 命令行入口

**单文件 Bundle：**
- `npm run bundle` → `dist/writemaster.single.cjs`
- 内嵌双母版 base64，无需 `node_modules` 即可运行

**Electron 桌面：**
- 三视图 Workbench 全部可执行：
  - **应用任务** — 选择母版/Profile，一键运行 md 或 docx 模式
  - **模板提取** — 上传母版 → 解析段落 → 右键标注语义角色 → 自动聚类 → 生成 Profile
  - **Profile 配置** — 列表/编辑/导入/导出/删除已保存的样式映射
- 右侧 Inspector：JSON 查看 / 临时样式 / Profile 摘要，支持三个切换面板
- 便携版打包：`npm run electron:portable` → `WriteMaster-portable-0.1.0.exe` (~84MB)

**Rust 包装层：**
- 薄 CLI 包装，通过 clap 解析参数，转发给 Node 核心
- 支持 `--md`、`--docx`、`--master`、`--master-id`、`--extract`、`--pandoc`、`--backup-md`

### 已完成本地验证

- Node CLI 帮助输出（含多母版列表 + --extract）
- Node 单文件 bundle 构建
- CLI smoke 导出（`review-master` 与 `chapter10-monograph` 均通）
- bundle 内嵌母版解析
- DOCX 结构提取（review-master: 455 blocks + 70 styles; chapter10-monograph: 172 blocks + 62 styles）
- 格式聚类（review-master: 8 个簇）
- Profile 生成与保存
- Profile 驱动的 processReview 管道
- Electron 本地启动（三个视图 + Inspector seg 控件 + 右键菜单 + 最近文件）
- Electron 便携版打包（`WriteMaster-portable-0.1.0.exe`）

### 当前限制

- Rust build on Windows requires MSVC Build Tools with `link.exe`（本地环境暂缺，代码语法已通过 clap 宏检查）
- Pandoc 为 md 模式的外部依赖（需单独安装或置于 `D:\Pandoc\pandoc.exe`）
- 当前格式规则主要适配中文教材模板（黑体标题、正文宋体、提示说明块等）
- 公式对象重排、交叉引用修复、目录域重建不在本版范围
