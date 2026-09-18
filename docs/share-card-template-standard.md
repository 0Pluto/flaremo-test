# 分享卡片模板开放标准（提案）

> 状态：**提案（2026-09-18）**——纯文档，未动代码。待维护者拍板后按 §8 分阶段实施。
> 关联：`docs/flomo-alignment-ux-refinement.md`（分享图片卡设计意图）、`apps/web/src/components/share-image-dialog.tsx`（现状实现）。

## 1. 背景与目标

分享卡片模板目前硬编码在 `share-image-dialog.tsx`：模板 id、文案、渲染三处耦合（`TemplateId` 联合类型 + `TEMPLATES` 列表 + 条件渲染）。每加一个模板都要改核心文件；模板携带的视觉/文案会无差别进入所有自部署实例，没有实例级取舍空间。

目标：把模板从核心代码里拆出来，成为一套**开放的、可社区贡献的、由实例管理员挑选启用的标准**：

1. **同构**：官方模板只是标准的第一批实现，社区模板用同一契约，无特殊路径。
2. **可选**：实例管理员在设置里挑选启用哪些模板、排序、定默认值，不需要改代码。
3. **可自定义**：模板可声明选项（开关 / 文案 / 颜色 / 枚举），管理员填值即改观感。
4. **开放标准**：模板以「文件夹即模板」形式贡献；清单字段、组件契约、选项 schema 文档化、版本化；第三方品牌可自带模板包——默认关闭，管理员显式启用后才出现。

非目标（本提案范围外）：运行时上传 / 在线市场、远程代码加载、分享页（HTML）主题化、模板缩略图截图流水线。

## 2. 现状审计（代码事实）

- 对话框 `apps/web/src/components/share-image-dialog.tsx`：`TemplateId`（33）、`TEMPLATES`（35-39）、三个卡片组件（62/87/114）、默认状态 `"plain"`（178）、条件渲染（234-242）、选择器（245-265）。产品名硬编码于 70、122 行。画布固定 340×420，导出走 `html-to-image` 的 `toPng(node, { pixelRatio: 2 })`（213）。
- 文案键 `share.template.{plain,daily,ticket}` × 8 语言（`zh-CN.ts:318-321` 等），由 `TranslationKey`（`key.ts:4-6`，从 zh-CN 推导）强制齐平；`i18n/messages/parity.test.ts:40-62` 校验缺失 / 多余 / 空值。
- 实例配置既有基座（白标 branding）：通用 KV 表 `settings`（`packages/db/src/schema.ts:751-762`，主键 `(user_id,key)`），实例配置存 **owner 行**；领域模块 `packages/domain/src/branding.ts`（白名单 / 归一化 / 读改写 upsert）；管理端 `GET/PUT /api/app/admin/branding`（`admin-api.ts:133-212`，owner-only）；公开端 `GET /api/app/branding`（`branding-api.ts:20-41`）；Web 侧 `branding.tsx` 的 `BrandingProvider` + BroadcastChannel 跨标签页同步；管理 UI `admin-page.tsx:685-980` `BrandingCard`。
- 工程接线：workspace 只收 `apps/*`、`packages/*`（`pnpm-workspace.yaml:1-3`）；各包**源码直出**（`main/types: ./src/index.ts`，消费方直接编译 TS 源，无构建产物依赖）；Vite 无特殊配置；Tailwind v4 从 `apps/web` 根扫描，仓外源码需 `@source`；模板选择无单测、无 e2e 引用（唯一间接覆盖是 i18n parity）。
- 既有设计意图：`docs/flomo-alignment-ux-refinement.md:131` 早有「一模板一组件」设想，未实施。

## 3. 设计原则

1. **文件夹即模板**：新增模板 = 新增一个目录 + PR，不改核心文件（构建期自动发现）。
2. **契约稳定、核心收口**：模板只用 props 契约里的数据；不得 import 应用内部（`@/` 别名仅应用可用）。契约带 `apiVersion`，不匹配即不加载。
3. **默认安全**：官方模板默认启用；非官方（社区 / 品牌）模板**默认关闭**，管理员显式启用后才出现在用户界面。品牌内容不会默认出现在任何实例——这是「开放标准」与「公开仓零商业痕迹」并存的支点。
4. **实例可配**：启用集合 / 顺序 / 默认 / 选项值属实例级配置（owner 管理），复用既有 settings KV 与公开只读端点模式。
5. **纯 DOM、可导出**：模板是纯函数 `props → DOM`（固定尺寸），无请求、无副作用，兼容 `html-to-image` 与明暗主题。
6. **不引入运行时远程代码**：v0 模板只存在于构建产物里（仓内目录或 npm 包，构建期打包）。运行时加载 / 市场是后续议题，且需沙箱模型（见 §7）。

## 4. 标准规格 v0

### 4.1 模板包结构

```
templates/
  README.md              ← 面向贡献者：怎么写一个模板
  src/
    spec.ts              ← 契约类型（ShareCardTemplate 等）
    registry.ts          ← 构建期自动发现（import.meta.glob）
    official/<id>/       ← 官方模板
      manifest.ts
      index.tsx          ← export default { manifest, Component } satisfies ShareCardTemplate
      assets/…           ← 可选（图片等，随包）
    community/<id>/      ← 社区 / 品牌模板（默认不启用）
    example/             ← 最小参考实现（注释齐全，供对照）
```

发现机制：`registry.ts` 用 `import.meta.glob("./{official,community}/*/index.tsx", { eager: true })` 汇总（构建期完成，零运行时开销）；id 冲突、缺字段在开发期直接抛错。eager 引入的包体开销与现状相同（现三个模板同样进主包）；未来可按模板懒加载，属后续优化，不进 v0 契约。

### 4.2 清单字段（`manifest.ts`）

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | kebab-case 全局唯一；社区包建议带命名空间前缀（如 `acme-editorial`） |
| `version` | 是 | 模板包自身 semver |
| `apiVersion` | 是 | 标准版本，本版为整数 `0`；核心只加载 `apiVersion === 0`，其余在管理端显示「不兼容」且不可启用 |
| `name` | 是 | `Record<locale, string>`；回退链：当前语言 → `en-US` → 首个可用值。官方模板应齐 8 语言 |
| `description` | 否 | 同上结构；管理端展示 |
| `author` | 否 | `{ name, url? }`；社区包必填 |
| `license` | 否 | SPDX；缺省视为随仓库 AGPL-3.0-only |
| `defaultEnabled` | 否 | 官方 `true`、社区缺省 `false` |
| `size` | 否 | `{ width, height }`，默认 `340×420`；导出按节点尺寸 ×2 |
| `options` | 否 | 选项 schema，见 §4.4 |
| `thumbnail` | 否 | 相对路径，**预留**（选择器缩略图，v0 不渲染） |

### 4.3 组件契约

```ts
export type ShareCardProps = {
  body: string; // Markdown 拍平后的纯文本
  date: string; // 已按当前语言格式化的时间
  day: string; // 当月日号（"1".."31"）
  stats: string; // 已格式化的统计行；加载中为空串
  locale: string; // 当前界面语言
  brand: {
    product: string; // 实例产品名（白标）
    markLightUrl: string | null;
    markDarkUrl: string | null;
  };
  options: Record<string, string | number | boolean>; // 已合并默认值
};

export type ShareCardTemplate = {
  manifest: ShareCardTemplateManifest;
  Component: (props: ShareCardProps) => ReactNode;
};
```

约束与建议：

- **固定画布**：按 `manifest.size` 渲染；对话框只居中预览，不缩放。
- **明暗主题**：预览在应用 DOM 内，用 `.dark` 变体 + 设计 token（`--brand-*`）适配；不要自带整页背景。
- **品牌位**：产品名 / 标志一律取自 `props.brand`（禁止硬编码 "FlareMo"）；实例主色通过 `--brand-*` 变量自然生效。
- **依赖面**：只允许 `react`；图标用内联 SVG；样式用 Tailwind 工具类（与核心同款视觉语言）；字体用系统 / 既有字体栈，不新增 webfont。
- **禁止**：网络请求、读取 localStorage / 会话、import 应用内部模块、运行期副作用。
- **导出兼容**：不依赖 hover / 动画终态；外部资源须随包（`assets/`）。

### 4.4 选项 schema（管理员可自定义的边界）

```ts
type OptionMeta = {
  label: Record<string, string>;
  description?: Record<string, string>;
};

export type ShareCardOptionSpec =
  | (OptionMeta & { type: "boolean"; default: boolean })
  | (OptionMeta & { type: "text"; default: string; maxLength?: number })
  | (OptionMeta & { type: "color"; default: string }) // #hex
  | (OptionMeta & {
      type: "number";
      default: number;
      min?: number;
      max?: number;
      step?: number;
    })
  | (OptionMeta & {
      type: "enum";
      default: string;
      choices: Array<{ value: string; label: Record<string, string> }>;
    });
```

- **核心负责**：渲染管理端表单、合并默认值后传入 `Component`；服务端只做**形状校验**（类型 / 长度 / 数量 / 总大小上限）。
- **模板负责**：对缺失 / 越界值保持健壮；v0 不强制范围校验（核心已保证类型正确）。

### 4.5 实例配置与接口

存储：owner 行的通用 KV，新键 `flaremo.instance.SHARE_CARDS`（与 `flaremo.instance.BRANDING` 同级）：

```json
{
  "enabled": ["plain", "ticket", "postcard"],
  "order": ["ticket", "plain", "postcard"],
  "default": "plain",
  "options": { "ticket": { "showStats": true } }
}
```

- **缺省**（无键或空）：取所有 `defaultEnabled` 的模板、按 registry 顺序；社区模板不出现。管理员把 `enabled` 清空时同样回落到缺省（用户永远至少有一张卡可导出）。
- **服务端归一化**：`id` 形状 `^[a-z0-9][a-z0-9-]{0,63}$`；数组去重、上限 50；`default` 必须 ∈ `enabled`，否则回落第一个；`options` 仅允许原始值、单实例总量 < 8KB。
- **未知 id 宽容**：服务端持形状不持清单（worker 不依赖前端 registry）；前端按「registry ∩ enabled」求交集，未知项静默忽略——模板被移除 / 降级不会弄挂实例。
- **管理端**：`GET/PUT /api/app/admin/share-cards`（owner-only，沿用 `ownerContext` 与既有 admin-api 写法）。
- **公开端**：`GET /api/app/share-cards`（匿名只读，与 branding 同款）；对话框打开时懒取，`staleTime` 5 分钟；失败回落到内置缺省，保证降级可用。
- **前端消费**：`share-image-dialog` 的选择器改为「registry ∩ 实例配置」驱动；默认选中 `config.default`，否则第一个。

## 5. 仓库落地（工程细节）

模板放**仓根 `templates/`**（不再收进 `apps/`）：它是「内容 / 标准」，不是应用代码，贡献者一眼可见。做成 source-only workspace 包（`@flaremo/share-templates`，`main/types: ./src/index.ts`——与 `packages/*` 同款源码直出，无构建耦合）。改动清单：

| 文件 | 改动 |
| --- | --- |
| `pnpm-workspace.yaml:1-3` | 增 `- "templates"` |
| `templates/package.json` | `name: @flaremo/share-templates`、`type: module`、`private`、`main/types → ./src/index.ts`、`check` 脚本（`tsc -b`，非 composite + `noEmit`） |
| `templates/tsconfig.json` | `extends: ../tsconfig.base.json`、`jsx: react-jsx`、`noEmit`、`types: ["vite/client"]`（glob 类型） |
| `apps/web/package.json` | 依赖增 `"@flaremo/share-templates": "workspace:*"` |
| `apps/web/src/index.css` | Tailwind v4 增 `@source "../../../templates"`（扫描模板内的工具类） |
| 根 `package.json:15,19` `check`/`typecheck` | 增 `pnpm --filter @flaremo/share-templates check` |
| 根 `package.json:16` `lint` 目录表 | 增 `templates` |
| `biome.json:29` 附近 | 增 `templates/**/*.ts` / `templates/**/*.tsx` |
| `vitest.config.ts:25` 覆盖 include | 增 `templates/src/**` |
| 根 `tsconfig.json:4-11` references | 增 `{ "path": "./templates" }` |

类型检查说明：模板源被 `apps/web` 的 `tsc -b` 经 import 图自然收编（与 `@flaremo/contracts` 同机制）；模板包自身另有独立 `check`，两边都不需要新增 composite 工程引用。注意 web 的编译选项（`verbatimModuleSyntax`、`erasableSyntaxOnly`、`noUnusedLocals`）对整个程序生效，模板源需遵守（不写 enum / namespace，类型导入用 `import type`）。

## 6. 迁移

- **内置模板归位**：现三个模板迁入 `official/{plain,daily,ticket}`，保持视觉现状；卡片内产品名改走 `props.brand`。
- **文案键迁移**：`share.template.{plain,daily,ticket}` 三个核心键删除（8 语言同一 commit），文案进官方模板 manifest 的语言表；`share.templateLabel` 保留（选择器 aria-label）。parity 测试只需各语言同步删除，无需新增。
- **在途的分享卡片重做**（含 PR #137）：按其性质拆分——通用视觉（票根精修 / 明信片）归 `official/`，第三方品牌卡归 `community/<brand>/`（默认关闭、附作者署名与许可）；品牌模板的启用与否由对应实例管理员决定。
- **无 DB 迁移**（复用 settings KV）。现无单测 / e2e 引用模板（§2 已核），迁移不破坏既有测试；P1 起补 domain / route 单测与一处 e2e（按 e2e 严格 opt-in 政策：写进仓库，默认不跑）。

## 7. 分发路径与后续

- **v0（本提案）**：仓内目录（`official/` + `community/`）。
- **v1（短期跟进）**：外部包接入两种方式——(a) 直接放目录（fork / 自部署自带）；(b) npm 包 + `templates/src/external.ts` 显式登记一行（构建期打包）。文档化「安装第三方模板包」流程与信任提示。
- **v2（远期，需单独设计）**：运行时上传 / 在线市场。模板即代码，运行时加载 = 在用户会话里执行第三方 JS；前提是**沙箱模型**（iframe 隔离 + postMessage 数据传递，或退化为纯声明式模板子集）。不满足沙箱前不做。
- **治理**：进仓模板走 PR 评审（代码审查即安全闸）；社区包必须声明作者与许可；文档明确「社区 / 品牌模板不代表官方背书」。

## 8. 分阶段实施与验收

| 阶段 | 内容 | 规模 |
| --- | --- | --- |
| **P0 标准与骨架** | `templates/` 包 + 契约类型 + glob registry + 三个内置模板归位 + 对话框数据驱动 + 工程接线（上表）+ `example/` 参考实现 | 1–1.5 天 |
| **P1 实例选择** | domain 模块（`share-cards.ts`，仿 branding.ts）+ KV 键 + admin GET/PUT + 公开 GET + 管理端卡片（启用开关 / 排序 / 默认）+ 8 语言文案 + domain/route 单测 | 1.5–2 天 |
| **P2 自定义选项** | 选项 schema 子集 + 服务端形状校验 + 管理端自动表单 + 默认值合并 + 预览 | 1–1.5 天 |
| **P3 社区分发** | 贡献指南（CONTRIBUTING + templates/README）+ 外部包接入文档 + `community/` 治理条款 | 0.5–1 天 |

验收口径沿用敏捷模式：`pnpm format` 先过 + 改动涉及的定向 vitest + `pnpm build` + `pnpm dev` 目检；e2e 严格 opt-in；部署走既有 `deploy-kosx.mjs`（P0 后即可滚一版，用户无感）。

## 9. 开放问题（待拍板）

1. **社区 / 品牌模板进公开仓**：建议允许（`community/` + 默认关闭 + 非背书声明）；备选为「仅标准进仓、品牌包一律外置（npm / 自有 fork）」。
2. **官方模板集**：建议 v0 = 素白 + 票根 + 明信片（在途重做的两张通用卡），日签可并入票根或保留，待定。
3. **默认启用策略**：建议官方模板默认全开（管理端可关）。
4. **命名**：`templates/` 目录 + `@flaremo/share-templates` 包名。
