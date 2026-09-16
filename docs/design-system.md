# FlareMo 设计系统(Ember)

**产品设计原则：简约不简单，克制不放肆。**

FlareMo 的视觉语言叫 Ember：界面保持安静，暖调中性色承担约 90% 的表面，品牌火焰色（橙 → 珊瑚，取自 logo 渐变）只出现在关键动作和状态上。克制是高级感的主要来源。

## 色彩

所有 token 定义在 `apps/web/src/index.css`，用 oklch 书写，`.dark` 类切换暗色。

- 品牌色阶 `--flame-50` ~ `--flame-700` + `--flame-coral`(Tailwind 类 `flame-*`)。`--flame-500` 是亮色模式主行动色（白底对比度达标），暗色模式用 `--flame-400`。
- 中性色带暖调（hue 60–80，小 chroma)，不要用纯灰。
- 语义色：`primary` / `secondary` / `muted` / `accent` / `destructive` / `success` / `warning` / `info` 及各自的 `-foreground`。
- 品牌渐变 `--gradient-brand`(Tailwind 类 `bg-brand-gradient`）只允许出现在四处：logo、主 CTA（如发送按钮）、置顶标记、选中态指示条。一屏最多一个渐变 CTA。
- 悬浮/hover 的品牌浅底用 `accent`（亮色 flame-50 / 暗色 flame 深底），不要用冷灰。

## 字体

- 字体栈：Geist Variable + CJK 回退（PingFang SC / Hiragino Sans GB / Noto Sans SC / Microsoft YaHei)。新增 UI 文本不要绕过 `font-sans`。
- 笔记正文 15px / leading-7(`.memo-markdown` 已固化）；时间戳、统计数字用 `tabular-nums`。
- 标题用 `font-semibold tracking-tight`；不要引入新字重。

## 形状与层级

- 圆角基准 `--radius: 0.75rem`：控件 8px(md)、卡片/composer 12px(xl)、浮层 14px、标签 chip 全圆角。
- 层级规则：页面 `bg-background` → 卡片 `bg-card + shadow-xs` → 浮层 `bg-popover + shadow-lg`。亮色模式用暖调阴影（`--shadow-xs/sm/md/lg`)；暗色模式不用阴影表达层级——`.dark` 的 shadow token 置近零，靠表面明度阶梯（实测值 0.155 / 0.21 / 0.235）+ 发丝线区分层级。
- 分隔用发丝线 `border-border/60`，不要用粗重边框。

## 动效

token:`animate-rise`(200ms expo 入场）、`animate-fade`(140ms)、`animate-scale-in`(140ms spring，小元素）、`animate-shimmer`（骨架屏）。

规则：

- 只动 `transform` 和 `opacity`；交互反馈 ≤140ms，入场 ≤320ms。
- 列表入场用 stagger（每张卡延迟 `index * 35ms`，上限 8 张，见 `MemoCard` 的 `index` prop)。
- hover 位移不超过 2px；按钮按压用已有的 `active:translate-y-px`。
- 全局 reduced-motion 兜底为准（`index.css` 的 `prefers-reduced-motion: reduce` 块关停全部动画/过渡）；新增大型编排动画仍需显式 `motion-safe:` 前缀，零散 transition 不必逐处加前缀。
- 不要在组件里写内联 `animate-[...]` 魔法字符串，统一用上面的 token。

## 组件约定

- 基于 shadcn(radix-nova)+ cva，新组件先进 `apps/web/src/components/ui/`。
- `Button` 的 `brand` 变体是渐变 CTA，一屏最多一个；`Badge` 的 `flame` 变体用于标签 chip。
- 笔记编辑是就地编辑（in-place)，不要新开 Dialog；`Esc` 取消、`Cmd/Ctrl+Enter` 保存。
- 骨架屏用 `Skeleton`(shimmer)，不要用 `animate-pulse`。
- 破坏性操作必须二次确认（AlertDialog)；变更用乐观更新 + toast 反馈。

## 文案

- 中文用全角标点，省略号用 `…`；英文用 sentence case。
- 产品内统一叫"记录 / note"，不要混用"笔记/便签/memo"（代码标识符除外）。官网中文文案同样遵守（"记录"而非"笔记"）。
- 空状态文案要给出下一步动作（例："在上方写下第一条记录")，不要只写"暂无内容"。
- 性能/容量宣称全站单一口径：官网延迟宣称基准为 sub-100ms；禁用"永不""终生""取之不竭""最优解"类绝对化词（对照 `docs/design-principle-rollout.md`）。

## 官网（Paper 体系）

官网 `apps/site` 运行独立于 Ember 的自建 token 体系：`signal`/`ink`/`mist`/`paper`（hex 而非 oklch，见 `apps/site/src/styles/tokens.css`）。视觉语言同源（火焰色点睛、界面安静），但不与应用共刷同一套变量。官网遵守与 Ember 等价的克制尺子（来源：`docs/design-principle-rollout.md` 第 0 节）：

- 一屏一个渐变：任何视口内品牌渐变最多 1 处 CTA + 0–1 处品牌识别元素（logo、渐变标题行）；光晕（blur-3xl 环境光）一屏最多 1 处，且不与渐变标题同屏。
- 无装饰性循环动画：无限循环只允许骨架屏 shimmer、真实状态指示（录音中、上传中）、录音波形；呼吸灯小圆点全站禁止。
- hover 光效每屏限额：cursor 聚光灯类组件单页最多 4 张卡使用，不与渐变标题同屏。
- 入场动效覆盖 ≤ 50%：单页被 Reveal/PopIn 包裹的区块过半即超标，必须留完全不动的区块。
- 数字不许浮夸：性能/容量宣称全站单一口径（见文案节）。
- 同款模板不连用：badge/heading/subtitle 三件套一页内连续复用 ≤ 2 次；一个视觉内不得有重复/相似标题。

全局 reduced-motion 兜底在 `apps/site/src/styles/tokens.css`；`AnimatedNumber` 等数字组件必须显式传 locale，避免 SSR/hydration 格式漂移。
