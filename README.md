<p align="center">
  <img src="icon/logo.png" alt="WriteMaster Logo" width="128" />
</p>

<p align="center">
  <h1 align="center">WriteMaster</h1>
  <p align="center"><strong>DOCX 格式整理 + AI 文稿审阅一体化工作台</strong></p>
  <p align="center">Markdown / DOCX → 母版风格输出，内置 AI 审阅技能，支持 CLI / 单文件 / Electron 桌面。</p>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" />
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" />
  <img alt="Version" src="https://img.shields.io/badge/version-0.6.0-blue" />
</p>

<p align="center">
  <a href="https://github.com/Ysoseri1224/Fully-Auto-Docx-Format-Process">GitHub</a>
</p>

---

## 快速开始（30 秒）

```powershell
# 1. 安装依赖
npm install

# 2. 查看帮助（确认一切就绪）
node src/cli.js --help

# 3. 跑一次 docx 整理
node src/cli.js --docx ./test/your-file.docx
# 输出：./test/your-file_review.docx

# 4. 跑一次 Markdown 转 DOCX
node src/cli.js --md ./test/your-file.md --master-id review-master
# 输出：./test/your-file.docx
```

---

## 功能一览

| 功能 | 说明 |
|------|------|
| **Markdown → DOCX** | Pandoc 转换 + OOXML 母版样式应用 |
| **DOCX 整理输出** | 对已有 DOCX 进行样式覆盖、段落分类、编号重排 |
| **AI 文稿审阅** | 上传 .md/.docx → 选择审阅技能（多选）→ AI 流式生成审阅报告 → 导出 .md |
| **多母版支持** | 内置 `review-master`、`chapter10-monograph`、`graduate-thesis`，支持自定义外部母版 |
| **审阅技能库** | ContRev 内置：去AI痕迹审阅、学术润色（English）、学术写作（English） |
| **CC Switch 集成** | 自动读取本地 CC Switch 数据库获取 Claude API 配置，零配置即用 |
| **智能段落分类** | 自动识别标题层级、正文、图题/表题、代码块、提示说明块 |
| **表格恢复** | 从 Markdown 源文件重建丢失的表格结构 |
| **编号系统** | 完整 numbering.xml 解析：decimal、括号编号、圈号编号、bullet、中文计数，支持样式继承编号 |
| **docDefaults 字体回退** | 解析 w:docDefaults 提供文档级默认字体/字号，确保所有段落有 effective 值 |
| **图片提取** | 支持 w:drawing 和 VML w:pict 两种嵌入方式，保留图片在渲染预览中 |
| **模板提取工作台** | Electron 内可视化提取母版结构，右键标注语义角色，自动聚类临时样式 |
| **Profile 配置** | 将样式映射保存为可复用配置，支持导入/导出 JSON |
| **单文件 Bundle** | 内嵌母版 base64 的独立 `.cjs` 文件，无需 `node_modules` |
| **Electron 桌面** | 四视图 Workbench（应用任务 / 模板提取 / Profile 配置 / 文稿审阅），Word 风格蓝白 UI，便携版 EXE |
| **Rust CLI 包装** | 零依赖的薄包装层，调用 Node 核心 |

---

## 为什么做这个项目

本项目的想法产生于撰写学术教材和专著的排版工作，由于word的格式十分繁杂，且论文和书籍的写作没有一个像Latex那样的成熟模板。
在AI agent工作流中，我们通常会先用 Markdown 完成初稿，然后通过 Pandoc 转成 DOCX，但产出的文件在段落样式、编号层级、代码块格式、表格结构等方面与出版社要求的母版差距很大，而pandoc没办法很精确地处理这些格式，于是想到了利用Nodejs的docx库，以满足一些定制化的需求。

**核心痛点：**
- Pandoc 生成的 DOCX 样式不精确——所有段落都是同一种格式
- 母版模板中的样式定义无法自动匹配到内容
- 编号系统（项目目标、括号编号、圈号编号）需要手工逐段调整
- 表格经常丢失，需要从 Markdown 源手动恢复

这个项目尝试把这些问题固化成可复用规则，实现一次配置，重复使用。

---

## 入口形态

| 入口 | 适用场景 | 启动方式 |
|------|---------|---------|
| **CLI** | 脚本/批量处理/CI | `node src/cli.js --md file.md` |
| **单文件 Bundle** | 独立分发、无需安装 | `node dist/writemaster.single.cjs --md file.md` |
| **Electron 桌面** | 可视化操作、模板提取 | `npm run electron` |
| **Rust 二进制** | 性能敏感/无 Node 环境 | `cargo build --release && ./target/release/writemaster-rs` |

---

## CLI 用法详解

```powershell
writemaster --md <file.md> [name]
writemaster --docx <file.docx> [name]
```

### 可选参数

| 参数 | 说明 |
|------|------|
| `--out <file.docx>` | 指定输出路径 |
| `--master <file.docx>` | 自定义外部母版 DOCX |
| `--master-id <id>` | 选择内置母版（`review-master` / `chapter10-monograph`） |
| `--pandoc <path>` | Pandoc 可执行文件路径（仅 md 模式） |
| `--backup-md <file.md>` | 备用 Markdown 文件（用于 docx 模式的表格恢复） |
| `--keep-temp` | 保留中间临时文件 |
| `--help` | 查看帮助 |

### 输出命名规则

| 命令 | 输出文件 |
|------|---------|
| `--md xxx.md name` | `xxx_name.docx` |
| `--md xxx.md` | `xxx.docx` |
| `--docx xxx.docx name` | `xxx_name.docx` |
| `--docx xxx.docx` | `xxx_review.docx` |

### 内置母版

| ID | 名称 | 类型 | 默认 |
|----|------|------|------|
| `review-master` | 教材 Review 母版 | review | 是 |
| `chapter10-monograph` | 第 10 章专著母版 | monograph | 否 |
| `graduate-thesis` | 毕业论文模板 | thesis | 否 |

---

## Electron Workbench

```
npm run electron           # 开发模式
npm run electron:portable  # 构建便携版 EXE
```

四视图：

1. **应用任务** — Markdown→DOCX 或 DOCX 整理，选择母版/Profile，一键运行
2. **模板提取** — 上传母版 DOCX，解析段落结构，右键标注语义角色，自动聚类生成 Profile
3. **Profile 配置** — 管理已保存的样式映射，编辑/导入/导出 JSON
4. **文稿审阅** — 上传 .md/.docx 文稿，选择审阅技能（多选），AI 流式生成审阅报告，导出 .md

---

## 构建

```powershell
npm run bundle            # 构建单文件 Node bundle → dist/writemaster.single.cjs
npm run electron:portable # 构建 + 打包 Electron 便携版 EXE
npm run rust:build        # 构建 Rust CLI 包装层
```

> Rust 构建需要 Visual Studio Build Tools（含 C++ 构建工具），否则 `link.exe` 不可用。

---

## 项目结构

```
WriteMaster/
├── src/
│   ├── cli.js                  # CLI 入口
│   ├── cli-single-file.js      # 单文件 bundle 入口
│   ├── core/
│   │   ├── review.js           # OOXML review 后处理核心
│   │   ├── build.js            # md → temp.docx → review.docx 管线
│   │   ├── extract.js          # DOCX 结构提取 + 聚类 + Profile 生成
│   │   ├── pandoc.js           # Pandoc 检测 + 自动下载
│   │   └── cc-switch.js        # CC Switch SQLite 配置读取
│   └── generated/
│       └── embedded-masters.js # 占位文件（构建时注入 base64）
├── electron/                   # Electron 桌面应用
│   ├── main.js                 # 主进程 + IPC handlers
│   ├── preload.js              # contextBridge API
│   ├── renderer.js             # 前端状态管理与渲染
│   ├── index.html              # Workbench 四视图 UI
│   └── lib/
│       └── marked.min.js       # Markdown 渲染库
├── ContRev/                    # AI 审阅技能库
│   ├── anti-ai-review/         # 去AI痕迹审阅
│   ├── nature-polishing/       # 学术润色
│   └── nature-writing/         # 学术写作
├── templates/                  # 内置母版 DOCX
│   ├── review-master.docx
│   ├── chapter10-monograph.docx
│   └── graduate-thesis.docx
├── scripts/
│   └── build-single-file.js    # esbuild 单文件打包
├── rust-wrapper/               # Rust CLI 包装层
│   ├── Cargo.toml
│   └── src/main.rs
├── dist/                       # 构建产物（bundle）
├── electron-dist/              # 构建产物（Electron 便携版）
├── test/                       # 测试文件和脚本
├── RELEASE.md
├── CHANGELOG.md
└── package.json
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| OOXML 操作 | [PizZip](https://github.com/open-xml-templating/pizzip) + [xmldom](https://github.com/xmldom/xmldom) |
| Markdown 转换 | [Pandoc](https://pandoc.org/)（外部依赖，仅 md 模式） |
| Markdown 渲染 | [marked](https://github.com/markedjs/marked)（浏览器端预览 + 报告展示） |
| SQLite 读取 | [sql.js](https://github.com/sql-js/sql.js)（WASM，读取 CC Switch 配置） |
| AI 审阅 | Claude API（SSE 流式，支持中转站） |
| 打包 | [esbuild](https://esbuild.github.io/) (bundle) + [electron-builder](https://www.electron.build/) (portable) |
| 桌面 | [Electron](https://www.electronjs.org/) |
| Rust CLI | [clap](https://docs.rs/clap/) |

---

## 贡献

欢迎提交 Issue 和 Pull Request。如果你对以下方向感兴趣：

- 更多母版模板适配
- macOS / Linux 便携版测试
- 公式对象重排
- 交叉引用修复
- 更精确的样式聚类算法

请先开 Issue 讨论后再提交 PR。

---

## 许可

MIT License
