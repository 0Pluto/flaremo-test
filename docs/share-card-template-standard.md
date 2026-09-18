# FlareMo 分享卡片模板规范（v1 · 提案）

> 状态：**提案稿 v1（2026-09-18）**。取代同日早先的 v0 提案（「不引入运行时远程代码」的保守设定已被本稿的沙箱模型取代）。
> 关联：`docs/flomo-alignment-ux-refinement.md`（设计意图）、`apps/web/src/components/share-image-dialog.tsx`（现状）、PR #137（在途的卡片重做）。
> 本文是**标准文档**：定义模板的格式、契约、分发与安装机制。实施路线见 §11。

## 0. 选型结论（先回答「TS 还是 JSON 还是插件」）

**标准分两层，同一份清单、同一条生命周期；「TS」不是分发格式，只是官方仓库内的一种作者写法。**

| | **Document（纸样）** | **Plugin（插件）** |
|---|---|---|
| 载体 | 一份 JSON 卡面文档 | 自包含 HTML 包（HTML/CSS/JS） |
| 渲染 | 核心渲染器在应用内直接画 | 沙箱 iframe 内自由渲染 |
| 能力 | 声明式排版：布局 / 文字 / 图片 / SVG / 主题 token / 选项 | **无限制**（沙箱内任意 HTML/CSS/JS，含 canvas） |
| 安全 | 数据，天然安全，无需沙箱 | 沙箱 + 严格 CSP，实测阻断一切网络（§3） |
| 适合 | 绝大多数卡片、非开发者作者、管理员店内浏览安装 | 特殊效果（水彩滤镜、自定义绘制、奇特排版） |
| 在途例子 | 票根 / 明信片 / 素白 | KOSX editorial 卡（若文档层表达不了） |

- **JSON**：是「Document」层的语言——不是简化到只能填色的配置，而是一套小型排版文档模型（§5），配内联 SVG 与自定义颜色/字体栈，表达力远超「换色皮肤」。
- **插件**：是「Plugin」层——这次的关键调研结论（§3）是：**在沙箱 iframe + `default-src 'none'` CSP 下，模板可以随便写、还能安全导出 PNG，而且一个字节都发不出去**。所以「放开限制」与「安全」不冲突。
- **TS/TSX**：仓库内官方/社区贡献者可选用 TSX 写 Plugin 源（配 starter 与构建脚本产出 bundle），或直接写 Document JSON。分发时统一为 zip 包。
- 管理员体验（要的「像商店一样」）：§7 的目录协议 + 安装/更新/卸载 + 上传本地模板。

## 1. 目标

1. **模板必须住在公开仓**：`templates/` 目录是标准的官方目录源（official + community 两区）。
2. **商店式体验**：实例管理员浏览目录、一键安装、启用/排序/配选项、有更新时升级、可卸载。
3. **可上传**：管理员可上传自己的模板包（zip），只进本实例（R2），并可「导出/提交到目录」。
4. **定制化强、少限制**：Document 层表达力要广；Plugin 层给满血自由；唯一保留的硬约束是「无网络、自包含」（§6.3 说明为什么）。
5. **品牌零默认污染**：社区/品牌模板默认不启用；仅管理员显式安装并启用后才出现在自己实例的用户界面。KOSX 卡即以此路径进仓（`community/`）。

## 2. 业界先例（调研摘要）

| 系统 | 机制 | 借鉴点 |
|---|---|---|
| **Ghost**（主题） | 主题 = 文件夹（Handlebars 模板 + `package.json`）；管理员后台上传 zip；上传时自动跑 GScan 校验，致命错误拒绝启用；官方市场收录 | 「文件夹即模板」「上传时校验」「校验器 CLI」三件套 |
| **Obsidian**（社区插件） | 目录 = 仓库里一个 JSON 索引（`community-plugins.json`）；插件 = `manifest.json` + `main.js` + `versions.json`（记录 minAppVersion 兼容表）；从 GitHub Release 按 manifest 版本号取文件 | 索引与产物分离；`minAppVersion` 兼容表；目录仓库 PR 制 |
| **Figma**（插件） | 插件分两世界：主线程沙箱（无浏览器 API）+ UI iframe（无宿主 API），靠 postMessage 沟通；网络域名需在清单声明，否则 CSP 拦截 | 「沙箱 + 消息传递 + 清单声明能力」正是本稿 Plugin 层的原型 |
| **shadcn registry** | 分发物是一份 JSON 描述（含文件、依赖、cssVars、docs、meta）；命名空间 `@ns/item`；可用 tag/commit 钉版本 | 目录条目字段设计；命名空间与版本钉法 |
| **Adaptive Cards** | 声明式卡片 JSON + `version` 字段，由宿主渲染；宿主能力差异靠版本协商 | 「文档 + 版本 + 宿主渲染」的兼容哲学 |
| **WordPress**（教训） | 主题/插件是任意 PHP，历史上大量漏洞源于此 | 为什么代码必须进沙箱、为什么编辑器源不能直接跑在应用域 |

## 3. 关键技术实测（2026-09-18，真实 Chromium）

在本地实例真实页面里做了三项验证（WebBridge 驱动，可直接复现）：

1. **沙箱导出可行**：`<iframe sandbox="allow-scripts">`（不透明源）+ 文档内 CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; script-src 'unsafe-inline'` 下，DOM → `foreignObject` 序列化 → `data:` 图 → canvas → `toDataURL('image/png')` **成功**；画布未被污染（无 SecurityError），背景像素逐位正确（`rgb(246,240,229)` = 卡片底色）。PNG 数据回传父窗口走 `postMessage`，正常。
2. **XHTML 命名空间细节**：foreignObject 内的元素需显式 `xmlns="http://www.w3.org/1999/xhtml"` 才会渲染（首测采样透明、补上命名空间后渲染正确）——已确认这正是 html-to-image 内部所做的处理，插件作者无需关心。
3. **网络外泄被阻断**：同一沙箱内三种外联方式全部被 CSP 拦截——`fetch` → TypeError、`new Image()` 外链 → 加载失败、同步 `XMLHttpRequest` → NetworkError。

结论：**「自由写代码的模板」与「拿不到用户数据的沙箱」可以同时成立。** 这是本标准的基石。

## 4. 模板包（分发格式）

统一载体：**zip 包**（说明：Document 也走同一包格式，以容纳预览图与资源文件）。

```
my-template/
  flaremo-template.json     ← 清单（必需）
  preview.png               ← 预览图（必需，店内展示用；512KB 内）
  card.json                 ← kind=document 时的卡面文档（必需）
  plugin/                   ← kind=plugin 时的入口目录（必需）
    index.html              ← 自包含入口（全部资源内联或同目录相对引用）
    …assets
  assets/                   ← 共享资源（可选：图片、字体；≤16 个文件）
```

### 4.1 清单 `flaremo-template.json`

```jsonc
{
  "specVersion": 1,              // 标准版本（整数）；本稿为 1
  "id": "kosx-editorial",        // 全局唯一，^[a-z0-9][a-z0-9-]{0,63}$
  "version": "1.0.0",            // 模板自身 semver
  "kind": "document",            // "document" | "plugin"
  "name":        { "zh-CN": "编辑体", "en-US": "Editorial" },   // 多语言，回退：当前 → en-US → 首键
  "description": { "zh-CN": "……" },                             // 可选
  "author": { "name": "…", "url": "…", "email": "…" },          // 社区模板必填
  "license": "MIT",              // SPDX；缺省视为 AGPL-3.0-only
  "defaultEnabled": false,       // 官方缺省 true、社区缺省 false（以目录条目为准）
  "size": { "width": 340, "height": 420 },   // 画布尺寸；200–1200px，缺省 340×420
  "options": [ … ],              // 选项 schema，见 §8
  "minAppVersion": "0.21.0"      // 可选；低于此版本的应用显示「需升级」且不可启用
}
```

## 5. Document 层：卡面文档（`card.json`）

由核心渲染器（应用内 React）解释执行——**纯数据，零代码**。设计哲学：不造布局引擎，映射到 DOM 让浏览器做排版。

```jsonc
{
  "specVersion": 1,
  "root": {
    "type": "column",
    "style": { "padding": 28, "gap": 16, "background": "#f6f0e5", "height": "100%" },
    "children": [
      { "type": "row", "style": { "justify": "space-between", "font": { "size": 11, "color": "#7d7468", "uppercase": true, "letterSpacing": 2 } },
        "children": [
          { "type": "text", "text": { "zh-CN": "记忆便签", "en-US": "MEMORY NOTE" } },
          { "type": "text", "text": "{date}" }
        ] },
      { "type": "text", "text": "{body}", "style": { "flex": 1, "font": { "family": "serif", "size": 15, "lineHeight": 1.9 }, "clamp": 12 } },
      { "type": "divider", "style": { "color": "#d4c7b4" } },
      { "type": "row", "style": { "justify": "space-between", "font": { "size": 9, "color": "brand.600" } },
        "children": [
          { "type": "text", "text": "{stats}" },
          { "type": "text", "text": "{brand.product}" }
        ] }
    ]
  }
}
```

### 5.1 节点类型（v1）

| 类型 | 用途 |
|---|---|
| `row` / `column` | 弹性容器（flex，横/纵，gap/对齐/换行由浏览器完成） |
| `text` | 文本：字面量、多语言表、或绑定（见 §5.2）；支持行数截断 |
| `image` | 图片：包内资源路径，或品牌绑定（`{brand.markLight}` / `{brand.markDark}`） |
| `svg` | 内联 SVG（元素白名单：path/circle/rect/line/g/defs/linearGradient/radialGradient/filter/feTurbulence/feDisplacementMap/feGaussianBlur 等，禁 foreignObject/script/事件属性）——水彩、纹理、装饰全靠它 |
| `divider` | 分隔线 |
| `spacer` | 占位 |

### 5.2 样式面

- **布局**：`padding/margin/gap/width/height/flex/align/justify/position(absolute + 四边偏移)/overflow`
- **外观**：`background`（纯色 / CSS 渐变）、`border`（宽/色/样式/圆角）、`shadow`（内置档位）、`opacity`、`rotate`（度）
- **文字**：`family`（`sans` | `serif` | `mono` | 包内字体名）、`size/weight/lineHeight/letterSpacing/align/uppercase/color`、行数截断 `clamp`
- **颜色**：任意 `#rrggbb(aa)`，或**实例主题 token**：`brand.50…950`、`brand.coral`、`ink`、`paper`、`muted` ——模板写 `"color": "brand.600"` 即自动跟随实例换肤（管理员改主题色，所有卡片同变）
- **绑定**：`{body}` `{date}` `{day}` `{stats}` `{locale}` `{brand.product}` `{brand.markLight}` `{brand.markDark}`；文本里可混排（`"由 {brand.product} 记录"`）
- **本地化**：卡片内固定文案写多语言表（同清单格式），未命中回落 `en-US`

### 5.3 包内字体

`assets/` 可放 woff2（≤2 个文件、每个 ≤400KB），在清单 `fonts` 里登记名字，文档内用 `"family": "自定义名"` 引用；核心在渲染前注入 `@font-face`。不引入 webfont 时用内置字体栈（含中文衬线/黑体、Geist、Noto）。

### 5.4 兼容策略

- 未知节点/样式：**跳过并忽略**，不崩溃；店内与预览标注「该模板使用更高版本能力」。
- `specVersion > 应用支持上限`：安装可行（文件落地），但「启用」置灰并提示升级应用——与 §4.1 `minAppVersion` 双保险。

## 6. Plugin 层：沙箱插件

### 6.1 宿主契约

- 模板是一个**自包含 HTML 入口**：`plugin/index.html`；所有资源内联（data: URI）或同目录相对引用（安装时整体落盘，运行时可取回）。**不允许任何网络请求**（CSP 强制）。
- 宿主把入口以 `srcdoc` 写入沙箱 iframe 时，**强制注入**（模板不可覆盖）：
  - CSP meta：`default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; script-src 'unsafe-inline'`
  - 桥接脚本：`window.FlareMo = { ready(payload), export(cb), onUpdate(cb) }`（内部即 postMessage 封装，见下）
- 数据流向：宿主 →（postMessage）→ 模板：`{ body, date, day, stats, locale, mode: "light"|"dark", brand: { product, markLight, markDark }, options, size }`；模板渲染完成后调用 `FlareMo.ready()`。
- 导出：宿主发 `export` 指令 → 模板侧序列化（DOM→canvas 或自绘 canvas）→ 回传 `{ png: dataUrl }`；超时 10s、尺寸 >12MB 拒绝，错误兜底弹出失败提示。
- 明暗模式：宿主传 `mode`，模板自行适配（沙箱内拿不到宿主 DOM）。

### 6.2 服务端强制（不能只靠前端）

- 安装的插件资源从实例网关提供（`/api/app/templates/<id>/<version>/…`），**所有响应带 `Content-Security-Policy: sandbox; default-src 'none'`**——即使有人直接打开插件 URL，浏览器也按不透明源处理，无法以应用域执行（这是 GitHub 服务用户内容的标准做法）。
- `X-Content-Type-Options: nosniff`；`Cache-Control: public, max-age=31536000, immutable`（URL 含版本，不可变）。

### 6.3 为什么「无网络」是唯一保留的硬约束

卡片渲染的全部输入（正文、统计、品牌）都是用户的私人内容。模板一旦能外联，就等于允许「模板作者在他人卡面里埋回传」——这是隐私红线，不是表达能力限制。**取消网络后，插件的最坏后果只剩「把卡片画得难看」**，这对自部署产品是可接受的信任成本（且管理员可预览后决定是否启用）。

## 7. 目录（商店）协议

### 7.1 目录索引 `registry.json`

托管在任意静态位置；官方目录由公开仓 `templates/` 生成（CI），并镜像到官网域名（`https://flaremo.app/templates/registry.json`），实例默认同时内置这两个地址（互为备份，避免单一 CDN/被墙问题）。

```jsonc
{
  "specVersion": 1,
  "name": "FlareMo 官方目录",
  "updatedAt": "2026-09-18T00:00:00Z",
  "templates": [
    {
      "id": "kosx-editorial",
      "kind": "document",
      "version": "1.0.0",
      "tier": "community",               // official | community
      "name": { "zh-CN": "编辑体" },
      "description": { … },
      "author": { "name": "…" },
      "license": "MIT",
      "size": { "width": 340, "height": 420 },
      "preview": "kosx-editorial/preview.png",
      "artifact": { "url": "kosx-editorial/kosx-editorial-1.0.0.zip", "sha256": "…", "size": 81234 },
      "addedAt": "2026-09-18"
    }
  ]
}
```

- 相对 URL 以 registry 自身地址为基准解析；跨域资源要求目录方提供 CORS。
- **自定义目录**：实例设置可增删目录源（名称 + URL），协议相同——开放标准的完整形态（官方目录只是默认源）。
- 信任标记：`official`（官方维护）/ `community`（社区 PR 收录）/ 自定义源（未背书）。界面明确标注。

### 7.2 安装 / 更新 / 卸载生命周期

1. **浏览**：管理端按目录拉索引，展示卡片（预览图 + 名称 + 作者 + tier + 体积）。
2. **安装**：下载 artifact → 校验 sha256 → 校验清单与包内一致性（§9 校验器）→ 解包（worker 侧 fflate）→ 逐文件写 R2（`templates/<id>/<version>/…`）→ 更新实例设置（安装列表）。
3. **启用**：默认关闭；管理员显式启用后进入用户端模板选择器。
4. **更新**：目录版本 > 已装版本时显示「可更新」；**钉版本安装**，升级需点击（可开「自动更新」开关，按实例）。
5. **卸载**：删除 R2 文件 + 设置项；已启用中的模板卸载时直接移出选择器（用户侧无感知降级到其他卡）。
6. **上传本地模板**：管理员传 zip → 同一校验器校验 → 落 R2（标记 `source: "local"`）→ 可启用。**本地模板只存在于该实例**，永不上传到任何第三方。
7. **提交到目录**：本地模板可一键导出 zip + 生成 PR 指引（把包放进 `templates/community/<id>/` 提 PR），收录后其他人也可安装。

### 7.3 内置模板与目录的关系

官方基础模板（素白/票根/明信片）**随应用内置**（构建期打包、离线可用），目录里也列出但标注「已内置」；内置模板可在管理端关闭（用户端不再出现），但不可卸载。社区/第三方模板走 §7.2。

## 8. 选项（管理员定制）

沿用 v0 的 schema 思路，扩展为：

```ts
type OptionSpec =
  | { key; label{…}; type: "boolean"; default: boolean }
  | { key; label{…}; type: "text"; default: string; maxLength?: number }
  | { key; label{…}; type: "color"; default: string }
  | { key; label{…}; type: "number"; default: number; min?; max?; step? }
  | { key; label{…}; type: "enum"; default: string; choices: { value; label{…} }[] }
  | { key; label{…}; type: "image"; default?: string }   // 从实例已上传图片/包内资源二选一（P3 起）
```

- 管理端按下表自动生成表单；**Document** 模板用绑定在文档里引用 `{options.<key>}`；**Plugin** 模板从数据载荷读 `options`。
- 服务端规则：未知 key 忽略；类型不符回落默认值；单模板 ≤20 项、单实例 options 总量 <8KB。

## 9. 校验器与工具链（在公开仓内）

- **`pnpm template:check <dir|zip>`**：校验清单字段、id 合法性、资源完整性、大小限额、Document 节点白名单、Plugin 自包含性（无外链）、preview 尺寸。CI 在 `templates/**` 的 PR 上自动跑（GScan 对位）。
- **`pnpm template:new <id>`**：脚手架生成 starter（document 与 plugin 两种模板）。
- **`pnpm templates:build`**：扫描 `templates/{official,community}/*/`，逐包产出 zip + sha256 + 汇总 `registry.json`（目录索引入库/发布）。
- 校验器同样供实例侧使用（上传时跑同一套规则，双端一致）。

## 10. 仓库布局（公开仓）

```
templates/
  README.md                    ← 贡献指南（怎么写、怎么提 PR、评审标准）
  registry.json                ← 生成物（目录索引，随 CI 更新）
  official/
    plain/  ticket/  postcard/ …       ← 官方基础卡（Document，内置随应用打包）
  community/
    kosx-editorial/ …                  ← 社区/品牌卡（默认不启用；PR 评审收录）
  starter/                     ← 脚手架模板源
  tooling/                     ← 校验器 / 打包器（templates:check / build）
```

- 社区收录标准（写入 README）：有作者与开源许可；校验器全绿；不得含跟踪/外联；品牌模板须在 `name` 与预览中表明身份；「收录 ≠ 背书」。

## 11. 落地路线

| 阶段 | 内容 | 规模 |
|---|---|---|
| **P0 文档引擎 + 归位** | `templates/` 包骨架（源码直出 workspace 包）+ Document 渲染器 + 三个内置卡转 Document + 对话框数据驱动 + 工程接线（workspace/biome/tsconfig/@source） | 2–3d |
| **P1 实例管理** | settings KV（`flaremo.instance.SHARE_CARDS`）+ admin GET/PUT + 公开只读端点 + 管理端「分享卡片」面板（启用/排序/默认/选项）+ picker 组合逻辑 + 8 语言 | 1.5–2d |
| **P2 目录与商店** | registry 生成 + 官网镜像 + 商店 UI（浏览/安装/更新/卸载）+ R2 存储 + 服务端 CSP sandbox 响应头 + sha256 校验 | 2–3d |
| **P3 上传与创作** | zip 上传（本地模板）+ 校验器双端 + starter 脚手架 + 导出/提交 PR 流程 | 1.5–2d |
| **P4 沙箱插件层** | Plugin kind 运行时（iframe 宿主 + 桥接 + 导出回传 + 超时/限额）+ 首个官方 plugin 示例（与 #137 融合）+ 安全回归测试 | 2–3d |

P0/P1 完成即可滚 kosx（用户无感）；P2 起商店可用；P4 之前 #137 的通用设计以 Document 形式先落地，KOSX 卡待 P4（或证明 Document 可表达，直接 P0 归位）。

## 12. 开放问题（待拍板）

1. **目录镜像地址**：官网 `flaremo.app/templates/` 镜像是否随 `apps/site` 部署（需要新增构建产物），还是先用 GitHub 原始地址 + jsDelivr 双源。
2. **插件层的时机**：P4 排在商店之后，或提前（若 KOSX 卡必须插件形态）。推荐按序。
3. **模板更新策略缺省值**：钉版本 + 手动更新（推荐，稳定）；还是跟随目录自动更新。
4. **社区收录门槛**：是否要求作者在包内附「示例渲染截图」（校验器之外的人工项）。
5. **包体上限**：当前定为 zip ≤2MB、预览 ≤512KB、字体 ≤2×400KB；是否放宽（插件带大图时）。
