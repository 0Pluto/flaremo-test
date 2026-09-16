# 编辑框所见即所得：P3 收口计划（实况盘点）

> 状态：**实况盘点完成，待执行**（2026-09-17）。
> 触发：GitHub issue #133（「正文增加加粗/下划线/斜体或 md 格式支持」）。核实结论：该 issue 的需求已被本分支实现覆盖，无需新方案；本文档回答「距离合并上线还差什么」。
> D1/D2 已由 Kim 于 2026-09-17 拍板：**全部按推荐执行**——D1 不做 Markdown 源码切换；D2 保留底部单行按钮位，不做浮动气泡菜单；下划线不做（无 Markdown 表示，落库即失样式）。三项与分支现状一致，无需改代码。

## 1. 实况总览

- 分支 `feat/composer-wysiwyg`（worktree `~/code/fm/FlareMo-wysiwyg`，HEAD `0fdba15`）：**6 个提交**，领先 main；main 领先 2 个提交（`99563f6` P3 audio loop、`6f754aa` docs）。
- 原 P0/P1/P2 分期**全部落地**，且有四项超出原稿：包体分割（TipTap 拆 async chunk，主包 gzip 166KB 回基线，编辑器 chunk 141KB）、卡片行内编辑迁移同一编辑器（Cmd+Enter 保存/Esc 取消，明文 Enter 不提交）、粘贴/拖拽上传占位 chip、随车修复「缺 Image 节点致粘贴图静默丢失」的 bug。真机走查通过，107 测试绿（截至分支最后提交）。
- 工作区状态：`FlareMo-wysiwyg` worktree **干净**；主检出 `~/code/fm/FlareMo`（main）**有未提交改动**，属并行 voice rollout §5 会话（mediaSession、角色感知文案、webmanifest、i18n +4 key、`capture-page.tsx`、`wrangler.jsonc.example`），**不是本任务的，不动它**。

## 2. 关键实现事实（逐项核实过）

- 编辑器本体 `rich-composer-editor.tsx`：StarterKit 白名单（heading 1–3、`underline: false` 显式关、link 不外跳）+ TaskList/TaskItem + inline Image + Placeholder + 官方 Markdown + 两个自定义扩展。
- `#标签` 高亮走 **Decoration**（`tag-highlight-extension.ts`），不走 mark——杜绝序列化污染正文；点击跳标签页逻辑在 `lib/tag-highlight.ts`。
- 上传占位走 **Decoration**（`upload-placeholder-extension.ts`，不进文档模型）；上传编排在 `lib/rich-editor-upload.ts` + `memo-composer.tsx` 的 `enqueueInlineUploads`（链式防交错，`preuploadedAttachmentNames` 随删除修剪）。
- 编辑框 DOM id 仍是 `#flaremo-composer-input`（load-bearing：全局 "c" 快捷键、PWA 聚焦、e2e 选择器），卡片编辑器用 `article` 内独立 id。
- Enter 定调（真机走查收敛版）：列表项内 Enter 续写新条目；非列表 Enter 发送；Cmd/Ctrl+Enter 任何位置发送；IME 组合期（keyCode 229）一律不提交。
- draft 管道：`editor.getMarkdown()` ↔ `draft.content`，上游恢复仅在 markdown 与 `lastEmittedRef` 不一致时 re-parse，防自环。

## 3. 剩余工作：P3 收口清单（按执行顺序）

### 3.1 rebase 到 main

- 预演过 merge-tree：**唯一冲突文件 `apps/web/src/components/memo-card.tsx`**——冲突源是 main 侧 `99563f6` P3 audio loop 加的 voice card；分支侧同文件是卡片编辑迁移。两侧改动语义独立，手工拼接即可。
- i18n 八文件、`capture-page.tsx`、`pnpm-lock.yaml` 均可自动合并。
- 在 `FlareMo-wysiwyg` worktree 内 rebase，不触碰主检出的脏工作区。

### 3.2 e2e 用例适配（3 个 spec，改选择器与断言）

编辑器从 `<textarea>` 变为 ProseMirror `contenteditable`（同 id），受影响点：

- `attachment-inline.spec.ts`
  - composer 粘贴用例：`toHaveValue(/\/file\/attachments\//)` 对 contenteditable **无效**（Playwright 的 toHaveValue 只支持 input/textarea/select）——改为断言 `textContent` 含附件引用；清空同理（contenteditable 无 value）。
  - 卡片行内编辑用例：`card.locator("textarea")` 定位失效——改为 `contenteditable` 定位（可沿用 `[contenteditable]` + card 作用域）。
- `workspace-flow.spec.ts`：`#flaremo-composer-input` 的 `.fill()` / `pressSequentially` 在 contenteditable 上可用（Playwright 支持），`toHaveValue` 断言需换——逐条核过再改。
- `memory-flow.spec.ts`：记忆弹窗的 `dialog.locator("textarea")` 疑似独立表单（非 memo composer），合并后跑一次确认，大概率不用动。
- **Playwright 只在 Kim 明确要求时跑**；适配只改 spec 本身，跑不跑等 Kim 指令。

### 3.3 Markdown 往返抽样校验

原决策稿 §8 风险项：用真实存量 memo（深层嵌套引用、非常规写法）抽样过一遍 `getMarkdown()` 往返，确认序列化归一化行为无破坏性。dev 环境 + kosx 只读抽查即可。

### 3.4 RTL 真机（阿语）

TaskItem checkbox、`#标签` Decoration、上传 chip 的方向性样式在阿语下过一遍；ProseMirror 原生支持 dir，预期只有 CSS 侧要核对。

### 3.5 合并 main（顺序依赖）

- **硬约束**：主检出 i18n 文件当前脏（voice §5 +4 key），分支也动了这些文件，此刻 merge 会被 git 拒绝（local changes would be overwritten）。
- 执行顺序：等 voice §5 会话收口提交 → 主检出工作区干净 → 在主检出 merge `feat/composer-wysiwyg`（此时分支已 rebase，理想情况是 ff 或近 ff）。
- 不 stash 并行会话的改动，不动它的文件（约定见 AGENTS.md 12.5 与并行会话共享检出的既有处理方式）。

### 3.6 验收与上线

- 验收口径（既定敏捷节奏）：`tsc` + 定向 vitest + `pnpm build` + dev 目检。
- 上线：kosx 滚一版（部署脚本在 flaremo-cloud 仓）；门禁不主动跑。
- 收尾：issue #133 回复「编辑器已支持所见即所得（加粗/斜体/任务列表/标签高亮等，Markdown 存储不变）；下划线因 Markdown 无对应语法暂不提供」并关闭。

## 4. 不做清单（本期定案）

- 下划线（D 定案：无 Markdown 表示，`<u>` 存储会破「纯文本存储」红线）。
- Markdown 源码切换开关（D1）：存储即 markdown，天然兜底。
- 浮动气泡菜单（D2）：底部单行按钮位保持。
- 表格入口、嵌套块、slash 面板（原稿 §5 既定）。
- 卡片渲染层更换：react-markdown + remark-gfm 留任。
