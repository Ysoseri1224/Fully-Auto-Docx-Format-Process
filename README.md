# WriteMaster

`WriteMaster` 是把当前教材整理工作流封成工具轮子的仓库版本。它统一复用同一套 Node 核心规则，并提供四个入口形态：

- CLI
- Node 依赖的单文件 bundle
- Electron 桌面壳
- Rust 二进制包装层

## 仓库结构

- `src/core/review.js`
  - 共享的 OOXML review 后处理核心
- `src/core/build.js`
  - `md -> temp.docx -> review.docx` 管线
- `src/cli.js`
  - `writemaster` 命令行入口
- `scripts/build-single-file.js`
  - 构建单文件 Node bundle
- `electron/`
  - Electron 前端壳
- `rust-wrapper/`
  - Rust 包装层
- `templates/review-master.docx`
  - 默认 review 母版

## CLI 用法

```powershell
writemaster --md D:\path\to\项目四.md
writemaster --md D:\path\to\项目四.md final
writemaster --docx D:\path\to\项目四.docx
writemaster --docx D:\path\to\项目四.docx clean
```

规则：

- `writemaster --md xxx.md name` -> `xxx_name.docx`
- `writemaster --md xxx.md` -> `xxx.docx`
- `writemaster --docx xxx.docx name` -> `xxx_name.docx`
- `writemaster --docx xxx.docx` -> `xxx_review.docx`

可选参数：

- `--out <file.docx>`
- `--master <file.docx>`
- `--pandoc <path>`
- `--backup-md <file.md>`
- `--keep-temp`

## 安装依赖

```powershell
npm install
```

## 快速验证

```powershell
node .\src\cli.js --help
node .\src\cli.js --docx D:\path\to\input.docx smoke
```

## 构建 Node 单文件

```powershell
npm run bundle
```

输出：

- `dist/writemaster.single.cjs`

这个 bundle 会把默认母版 `review-master.docx` 以内嵌方式打进去，因此可以作为真正的单文件 Node 工具运行：

```powershell
node .\dist\writemaster.single.cjs --help
```

若要快速做一轮 smoke test：

```powershell
node .\dist\writemaster.single.cjs --docx D:\path\to\input.docx smoke
```

## 启动 Electron

```powershell
npm run electron
```

## 构建 Rust 包装层

```powershell
npm run rust:build
```

注意：

- Windows 下需要可用的 Rust MSVC 链接环境
- 如果出现 `link.exe not found`，需要安装 Visual Studio Build Tools，并勾选 C++ 构建工具

生成的 Rust 二进制会优先调用：

1. `dist/writemaster.single.cjs`
2. 若 bundle 不存在，则回退到 `src/cli.js`

## 首发建议内容

- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `RELEASE.md`
- `templates/review-master.docx`
- `src/`
- `scripts/`
- `electron/`
- `rust-wrapper/`

## 当前实现策略

- 真正复杂的规则仍然集中在 Node 核心
- Electron 和 Rust 先复用这套核心，不重复实现 OOXML 逻辑
- 这样后续继续修：
  - 编号逻辑
  - SQL 断行
  - 例题样式
  - 提示说明拆段
  - 表格恢复

都只需要改一处核心
