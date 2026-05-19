# Claude Handoff / Next-Step Prompt

本文件用于给下一个 AI agent 直接接手当前仓库状态，避免重复排查。

---

## 1. 项目定位

`WriteMaster` 是一个把现有 DOCX 格式整理工作流封装成工具的仓库。

当前统一复用 Node 核心，暴露四个入口：

- CLI
- Node 单文件 bundle
- Electron 桌面壳
- Rust 包装层

核心目标不是“通用 Word 编辑器”，而是：

- 把 Markdown 或 DOCX 输入转成指定母版风格的 DOCX
- 复用 OOXML 规则进行后处理
- 后续扩展为可视化模板提取与规则配置工作台

---

## 2. 当前已完成工作

### 2.1 内嵌母版机制已从单母版升级为多母版

当前内置母版固定为 2 个：

- `review-master`
- `chapter10-monograph`

对应文件：

- `templates/review-master.docx`
- `templates/chapter10-monograph.docx`

说明：

- `chapter10-monograph.docx` 来自原 `test/第10章初稿_全批注+主要公式.docx`
- 已复制到 `templates/`，避免 Electron 开发态与打包态资源路径分裂

### 2.2 核心母版解析逻辑已统一

关键文件：

- `src/core/review.js`
- `src/core/build.js`
- `src/cli.js`

已完成：

- 新增多母版注册表逻辑
- `resolveMasterPath()` 已支持：
  - `masterId`
  - `customMasterPath`
  - 兼容旧 `masterPath`
- CLI 和 Electron 共用同一套母版解析逻辑
- 默认母版固定为 `review-master`

### 2.3 Electron 首页已切到 workbench 风格壳

关键文件：

- `electron/index.html`
- `electron/renderer.js`
- `electron/main.js`
- `electron/preload.js`

已完成：

- 旧简表单首页已被替换
- 首页现在有三个视图：
  - `应用任务`
  - `模板提取`
  - `Profile 配置`
- 当前只有 `应用任务` 是真实可执行的
- `模板提取` / `Profile 配置` 目前只是结构壳，不带真实提取逻辑

### 2.4 Electron 已支持内置母版选择

已完成：

- 新 IPC：
  - `writemaster:list-masters`
  - `writemaster:pick-master-file`
- `writemaster:run` 已改为接收：
  - `masterId`
  - `customMasterPath`

UI 现状：

- 内置母版下拉可选
- 末项是“自定义外部母版…”
- 选中外部母版时显示路径输入和文件选择按钮

### 2.5 单文件 bundle 已升级到双内嵌母版

关键文件：

- `scripts/build-single-file.js`
- `src/generated/embedded-masters.js`

说明：

- `src/generated/embedded-masters.js` 是占位文件，正常情况下内容是 `module.exports = [];`
- 执行 `npm run bundle` 时，会临时注入两个母版的 base64
- bundle 构建完成后，会恢复占位内容
- 开发态依赖 `templates/` 下真实 DOCX
- bundle/便携版依赖真正内嵌数据

---

## 3. 当前验证结果

已验证通过：

### 3.1 CLI

执行：

```powershell
node .\src\cli.js --help
```

结果：

- 已显示 `--master-id <id>`
- 已显示两个 built-in master id

### 3.2 单文件 bundle

执行：

```powershell
npm run bundle
```

结果：

- 成功生成 `dist/writemaster.single.cjs`

### 3.3 核心内置母版解析

已验证：

- `resolveMasterPath({ masterId: 'review-master' })`
- `resolveMasterPath({ masterId: 'chapter10-monograph' })`

均能返回正确模板路径。

### 3.4 CLI 实际走 `--master-id`

执行过：

```powershell
node .\src\cli.js --docx D:\DESKTOP\Fully-Auto-Dedicated-Format-Process\test\chapter9_pandoc_temp.docx smoke --master-id chapter10-monograph
```

产物：

- `test/chapter9_pandoc_temp_smoke.docx`

说明：

- 说明入口参数已经贯通到底层

### 3.5 Electron 启动情况

执行：

```powershell
npm run electron
```

现象：

- 进程进入事件循环，没有直接报错退出
- 语法层面已检查：
  - `electron/main.js`
  - `electron/preload.js`
  - `electron/renderer.js`
  - `src/core/review.js`
  都通过

注意：

- 尚未做一轮完整的 Electron 可视点击验证
- 需要下一个 agent 继续做 UI 实操测试

---

## 4. 当前未完成事项

### 4.1 Workbench 只是壳，还没有真实模板提取能力

当前 `模板提取` 页面只展示：

- 当前模板 JSON
- 预期工作流占位

尚未实现：

- DOCX 结构解析为中间模型
- 段落/表格/图题块识别
- 临时样式聚类
- 右键语义标注
- Profile 生成/保存/导入

### 4.2 Electron 需要一次真实交互验证

必须补的检查：

- 内置模板下拉是否正常加载 2 项
- 切换到 `chapter10-monograph` 后能否正常执行
- 选择“自定义外部母版”后按钮和路径显示是否正确
- `应用任务` 页面在：
  - `md` 模式
  - `docx` 模式
  下是否都能真实运行

---

## 5. 当前重要文件与职责

### Node 核心

- `src/core/review.js`
  - OOXML review 后处理核心
  - 模板解析、样式覆盖、SQL 代码、提示说明、编号逻辑等

- `src/core/build.js`
  - `md -> temp.docx -> review.docx`

- `src/cli.js`
  - 命令行入口

### 内嵌母版

- `templates/review-master.docx`
- `templates/chapter10-monograph.docx`
- `scripts/build-single-file.js`
- `src/generated/embedded-masters.js`

### Electron

- `electron/main.js`
  - IPC 和执行入口

- `electron/preload.js`
  - 向 renderer 暴露 API

- `electron/index.html`
  - Workbench 风格首页

- `electron/renderer.js`
  - 显式状态模型
  - 视图切换
  - 模板列表展示
  - 运行任务

### 设计参考

- `WORKBENCH_DESIGN.md`
- `electron/workbench_mock.html`

说明：

- 当前真实首页是按照这两个文件的方向改写的
- 但没有把 mock 全量原样照搬，而是只保留可落地的壳结构

---

## 6. 当前 git 状态特点

当前存在未提交变更，主要是：

- `README.md`
- `electron/index.html`
- `electron/main.js`
- `electron/preload.js`
- `electron/renderer.js`
- `scripts/build-single-file.js`
- `src/cli.js`
- `src/core/build.js`
- `src/core/review.js`
- 删除：`src/generated/embedded-master.js`
- 新增：`src/generated/embedded-masters.js`
- 新增：`templates/chapter10-monograph.docx`

另外：

- `WORKBENCH_DESIGN.md`
- `electron/workbench_mock.html`
- `test/`

目前是 untracked 状态

注意：

- `test/` 目录里混有很多 branch 工作文件，不要轻易整体提交或整体删除
- 需要人为判断哪些 test 文件属于产品仓库，哪些只是临时实验产物

---

## 7. 对下一个 agent 的直接提示

请在这个基础上继续，不要重做以下事情：

- 不要再回退到旧的 Electron 简表单首页
- 不要再把母版逻辑拆成 CLI 一套 / Electron 一套
- 不要恢复 `embedded-master.js` 单母版结构
- 不要把 `chapter10-monograph` 继续只放在 `test/` 下

你下一步应优先做：

1. 真正验证 Electron 首页交互
2. 用内置 `review-master`
3. 用内置 `chapter10-monograph`
4. 用自定义外部母版
5. 分别跑通一次 `md` 和 `docx` 模式
6. 如无问题，重打 Electron 便携版并验证
7. 再更新 `RELEASE.md` / 提交说明

---

## 8. 推荐的下一步验证命令

### CLI help

```powershell
node .\src\cli.js --help
```

### Bundle

```powershell
npm run bundle
```

### Electron 开发态

```powershell
npm run electron
```

### 便携版打包

```powershell
npm run electron:portable
```

### 内置专著母版 smoke

```powershell
node .\src\cli.js --docx D:\DESKTOP\Fully-Auto-Dedicated-Format-Process\test\chapter9_pandoc_temp.docx smoke --master-id chapter10-monograph
```

---

## 9. 额外注意

- `src/generated/embedded-masters.js` 开发态为空是正常现象，不是 bug
- 若后续要让开发态也显示 `sourceType: embedded`，需要另外设计，不要误判当前实现错误
- 当前 `模板提取` 页只是占位壳，不要误以为已经具备结构解析能力
- 如果要继续实现工作台，请以 `WORKBENCH_DESIGN.md` 为准，不要直接从现有 `renderer.js` 强行堆逻辑

