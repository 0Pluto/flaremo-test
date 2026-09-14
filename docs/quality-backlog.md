# 稳健性待修复清单（Quality Backlog）

状态：09-15 两轮体检（第一轮四路概览 + 第二轮逐文件深挖与安全面）。本文是**待修复项的唯一清单**，按优先级分组，每项含证据（文件:行号）、影响与修法建议。解决一项就勾一项，全部修完可归档本文档。

整体背景：代码库工程水位偏高（后端零 TODO/FIXME，outbox+lease+dead-letter 模式一致，鉴权 fail-closed），本清单不是"写得烂"的债，而是**安全边界缺口 + 功能纵深短板 + 新页面没继承老页面稳健标准**三类。

---

## P0-S · 安全漏洞（第二轮深挖确认，最先修）

以下每条都经过源码级复核确认（非猜测）。注意：跨组织越权随团队组织模型（36c314b）引入，已部署 kosx——该实例单组织无实际暴露，但多组织部署（尤其 SaaS）是真越权。

- [ ] **跨组织越权写/删（最高危）**：`canEditMemo`/`canGovernMemo` 只检查 `memo.teamId !== null`，不检查归属组织（`packages/domain/src/team-permissions.ts:118`、`:128`）；而读边界 `canReadMemo:101` 严格比对 `memo.teamId === user.teamOrganizationId`。`updateMemo`（memos.ts:612/615）与 `hardDeleteMemo`（memos.ts:861）都经 `getMemoById` → `memoReadScope`（他组织 public+normal 可读）→ `assertCanEditMemo`，于是**任何组织的 owner/admin 可改写、改可见性、回收站乃至硬删除另一组织的公开 memo**。修法：两个谓词补 `memo.teamId === user.teamOrganizationId`（与 canReadMemo 对齐），team-permissions.test.ts 补跨组织用例。
- [ ] **mention 通知绕过读权限泄露内容**：`buildMemoMentionNotifications`（`packages/domain/src/memos.ts:914-940`）只排除发送者与已提及者，不按 `canReadMemo` 过滤被 @ 者；`canReadNotificationMemo`（`memos-user.ts:496-504`）对 protected 一律放行任何登录用户，配 `notificationSnippet`（:506，最多 200 字）。影响：protected 团队 memo 里 @ 一个团队外用户，对方收到含正文摘录的通知。修法：mention 过滤加 canReadMemo；`canReadNotificationMemo` 的 protected 分支加组织归属判断。
- [ ] **CEL filter 正则 ReDoS**：`validateRegexPattern` 黑名单挡不住交替回溯（`memo-filter.ts:1100-1122` 只挡反向引用/`(?=`/一种嵌套量词），`flaremo_matches` 逐行跑在最长 100k 内容上、JS 扫描最多 5000 行（`memos.ts:380-381`）。一条 filter 可烧穿 Worker CPU。修法：限长 + 简单形态白名单，或引入受限正则（re2 风格）库。
- [ ] **评论绕过域层统一上限**：`createMemoComment` 不调 `assertMemoContentSize`（memos-social.ts:192-206）、不调 `assertMemoCountQuota`、不查 `isActiveTeamMember`。评论即 memo，可超限刷量。修法：对齐 createMemo 的三个门。
- [ ] **SSE 事件面宽于读面**：`canReceiveMemosSseEvent` 让任何 active 成员收全部 protected/public 事件（`memos-sse.ts:77-84`），多组织部署泄露他组织 memo 存在性与作者。修法：protected 事件加组织过滤。
- [ ] **评论区可见性弱于 memoReadScope**：`listMemoComments` 对 protected 不看组织归属（`memos-social.ts:369-377`）。修法：复用 memoReadScope 行级判定。
- [ ] **reaction 生命周期**：对 trashed/archived memo 仍可打（`memos-social.ts:462` 无状态检查）；无效 upsert（同值幂等）也发 SSE 造成事件洪泛（`:487-493`）；memo 转 private 后 reaction 创建者删不掉自己的 reaction（`:643-645` NotFound 卡死行）。修法：状态检查 + 变化才发事件 + reaction 删除不要求 memo 可读（只要求是本人 reaction）。

---

## P0 · 横向战役：新页面缺失错误态（最快见效，一次清掉）

同一根因：时间线/composer 老页面有完整的错误态+重试+乐观更新标准，后来新增的页面查询失败会**伪装成"空数据"**，用户分不清"没有"和"挂了"。修法同款：加 `isError` 分支 + 重试按钮 + toast，对齐 memo-list 的标准。

- [ ] **日历页主网格**：`calendarQuery` 无 `isError` 分支，失败渲染成"本月无任务"空网格（`apps/web/src/pages/calendar-page.tsx:72-76`，渲染判断在 `:185` 附近只看 `isLoading`）。
- [ ] **日历页 Agenda 视图**：`tasksQuery` 失败显示"无日程"（`calendar-page.tsx:578-581`）。
- [ ] **日历页 projects 失败**：`projectsQuery` 失败 → 快捷添加按钮永久禁用且无提示（`calendar-page.tsx:101-104`、`:240`、`:521-527`）。
- [ ] **日历页 DayPanel stale 日期**：`nextDate` 只在首次 mount 初始化为 `day`，切换选中日期后进入改期模式会带旧日期（`calendar-page.tsx:285`，`useState(day)` 应随选中日期同步）。
- [ ] **项目看板页**：`projectsQuery`/`tasksQuery` 无 `isError`，失败落入"暂无任务"空态；所有任务状态变更非乐观，慢网无即时反馈（`apps/web/src/pages/projects-page.tsx:97-106`、`:557-585`）。
- [ ] **Memory 主列表**：`listQuery` 无 `isError`，失败渲染成 `memory.emptyTitle` 空态；同文件 review tab（`:187-211`）和 revisions（`:528-545`）已有标准错误态可抄（`apps/web/src/pages/memory-page.tsx:81-84`、`:250-273`）。
- [ ] **通知铃铛**：60s 轮询失败 `?? []` 显示"暂无通知"，无错误态（`apps/web/src/components/notification-bell.tsx:57-97`）。
- [ ] **语义搜索 degraded 信号被丢弃**：后端降级回退 FTS 时前端无感知，`api.ts:194-197` 声明了 `degraded` 但 `App.tsx:176-179` 只取 `data?.memos`；顺手区分"额度用尽/服务未配置"的空态提示。

## P1 · 通知与提醒系统（最大的单模块战役）

触达是产品唯一没闭环的"必须能力"：事件源都在（每日回顾、任务逾期、mention），缺的是管道。

- [ ] **Web Push 回顾触达**：ROADMAP L29 后续项。决策点已列在 product-requirements.md L197-202（Web Push vs 站内通知）。建议：Service Worker + Push subscription 存 D1，cron 生成 daily_review 通知时同发 push。
- [ ] **任务逾期提醒**：日历已能识别逾期（拖拽防呆），但没有主动提醒渠道；tasks.dueAt 是唯一事实源，cron 里加逾期扫描 → 站内通知（Web Push 落地后自动受益）。
- [ ] **通知铃铛轮询升级**：Web Push 落地前，至少把 60s 轮询失败可见（P0 已含错误态），并考虑 SSE（`/api/app/events` 已有 memo 事件流）顺带推通知，砍掉独立轮询。
- [ ] **邮箱渠道缺失的边界声明**：`FLAREMO_EMAIL_PROVIDER=none` 时忘记密码流程关闭（deploy.md L143 已写明"不要把假成功当恢复能力"），账户页应明示此状态。

## P1 · Memory 模块补强

- [ ] **listMemories 无分页**：全量拉取，memory 增长后是超时/性能风险点（`apps/web/src/api.ts:285-302`）→ 加 limit/cursor 与后端 listMemories 对齐。
- [ ] **memory 域层补单测**：`packages/domain/src/memory.ts`（1348 行，全仓最大域文件）无专属测试，核心路径（创建/确认/锁定/晋升/supersede）值得直接覆盖。
- [ ] **MemoryFormDialog 错误提示**：直接展示原始 `error.message` 而非统一 i18n 兜底（`memory-page.tsx:670-675`）。

## P2 · 分享/详情页收口

- [ ] **详情页 sharing tab 与飞书式弹窗双轨**：`memo-detail-page.tsx:474-559` 还是旧"创建链接/撤销"UI，与 memo-card 的三选弹窗并存；收口为同一交互（保留 private/protected/public 定调）。
- [ ] **时间线分享链接刷新即消失**：`sharesByMemo` 是内存态（`use-memo-mutations.ts:37`），刷新后卡片上已分享链接不可见（详情页仍在），展示不一致 → 持久化或随列表返回。
- [ ] **公开分享页 SEO**：R11 收官欠账（product-requirements.md 现状差距表）。

## P2 · 测试覆盖空白（按风险排序，非全部要补）

- [ ] **cron/queue 生命周期**：`apps/worker/src/index.ts` scheduled（附件 GC、回收站清理、review 通知、webhook/embedding sweep）与 Queue 消费者无自动化测试，仅 maintenance.md 手动验证。
- [ ] **data-tasks / import-export**：分块导出、任务过期边界零专属单测（`packages/domain/src/data-tasks.ts`、`import-export.ts`）。
- [ ] **shares 域层**：token 生成/撤销/公开读取（`packages/domain/src/shares.ts`）无专属单测。
- [ ] **无专属测试的 routes**（10 个，靠 api.test.ts 集成兜底）：app-api、account-api、admin-api、auth-api、branding-api、capture-api、memos-file-api、memos-sse、tasks-api、public-api。
- [ ] **e2e 缺口**（ROADMAP R8）：Markdown 渲染、历史/revision 恢复、反向链接面板、分享撤销、附件预览。
- [ ] **packages/db 零测试文件**（仅 test-migrations 辅助）。

## P3 · 兼容层与运维债（低频但记账）

- [ ] **webhook egress SSRF 防护**：架构已知边界（architecture-notes.md L262）；Workers 环境天然难达内网但值得显式校验 URL。
- [ ] **恢复演练证明过期**：maintenance.md L153 自认"2026-07-23 的远端演练不能替代全表恢复证明"，需重做一次 `backup:drill:remote` 并更新记录。
- [ ] **memos-connect-api.ts 体量**：3183 行单文件（Connect/gRPC 兼容层），复杂度热点，可评估拆分（纯重构，无行为变更）。
- [ ] **deploy.md 重复标题**：两个"## 手动部署"（L17、L21）。
- [ ] **设计文档状态行过时**：`docs/vector-namespace-design.md` L3 仍写"待实施"，实际已实施部署，改状态行。

## P1-D · 数据正确性与一致性（第二轮深挖：写路径漏齐配套）

同一根因族：多条写路径改了数据但没把配套动作（updatedAt / revision / reindex / SSE / webhook / 事件幂等）带齐。

- [ ] **renameTag/deleteTag 不 bump `updatedAt`、不写 revision、不发 embedding reindex、不发 SSE/webhook**（`tags.ts:227-269`、`:317-344`）：内容变了但同步/分页看不见变更，语义向量对改名后内容**永久过期**，订阅端无事件。另：单 batch 语句数随标签使用量无上限扇出（`:265-274`，几百条 memo 会撞 D1 单批上限）；`rewriteTagInContent` 全文改写不避代码块/URL fragment（`:371-380`），会改坏代码示例和锚点。
- [ ] **replaceMemoRelations 会拆掉评论关系**：delete 语句按 `memoId = 本 memo` 无 type 过滤（`relations.ts:96-98`），客户端只回传 reference 关系时评论与父 memo 的关联被静默拆除；relations 数量无上限（`:70-83`）。
- [ ] **revision 无界增长且无修剪**：每次变更插全量 revision（memos.ts:765-776），无按 memo/时间的修剪（仅删号级联），单条最多 100k 内容，线性膨胀。
- [ ] **restore revision 连 visibility 一起回滚**（`revisions.ts:64-68`）：恢复旧内容会把已团队化的 memo 拉回个人（或反向），"恢复内容"动了分享范围。
- [ ] **并发丢失更新**：`updateMemo` 无版本条件（memos.ts:602 起，where 仅 id+userId），两个并发编辑互相静默覆盖；quota 检查与插入非原子（memos.ts:116 vs :183）；client_id 冲突 TOCTOU 预检（`:641-646`）并发时抛裸 D1 错误。
- [ ] **webhook 快照失真**：trashed/deleted 一律报 ARCHIVED（`memos-webhooks.ts:427-429`）；`reactions` 字段恒为空数组（`:440`）；失败原因压成四个粗桶连原文不留（`:407-418`）。
- [ ] **updateMask 指定 signing_secret 但未传新值 → 秘钥被静默清空**（`memos-user.ts:181-185`、`:622-657`），webhook 变无签名投递。
- [ ] **>100 个 @mention 令创建/更新整体失败**：`findMentionedUsers` 单 `inArray` 超 D1 参数上限（`memos-user.ts:381-386`），异常在 batch 前炸掉整个写操作。
- [ ] **creator_id 哈希碰撞**：31 位 FNV 截断+最小值钳 2（`memo-filter.ts:1132-1146`），几万用户级生日碰撞可让 `creator_id ==` filter 匹配错作者。
- [ ] **`tags.all(...)` 空列表语义被改写为 false**（`memo-filter.ts:390`），与 CEL vacuous-true 标准相反，否定式 filter 结果与上游 Memos 相反。
- [ ] **updateShortcut 路径名与 body 名不一致时静默以 body 为准**（`memos-social.ts:766-772`）。
- [ ] **createUserWebhook 把任意插入错误包成 ConflictError**（`memos-user.ts:145-153`），错误分类失真。
- [ ] **CEL 行级求值异常把整个列表打挂**：单行畸形 payload/时间让某 filter 永久 400 无降级（`memo-filter.ts:167-176` + `memos.ts:381`）。

## P2-B · 性能与容量（第二轮深挖：规模上限点）

- [ ] **中文等非拉丁搜索退化为无上限 LIKE 全表扫描**：`buildFtsQuery` 只放行 Latin/数字（`memos.ts:988-996`），中文查询走 `content LIKE '%…%'`（`memos.ts:284`）——中文主力用户的每次搜索都是全表扫。修法方向：FTS5 加 trigram tokenizer 或自定义分词。
- [ ] **CEL 扫描先扫满 5000 行再报错**（`memos.ts:376-392` 取 `scanLimit+1` 行才判断），廉价 filter 可反复触发 5000 行 hydration 放大读配额。
- [ ] **通知列表 N+1 + 分页静默截断**：每行 DTO 触发 1-2 次点查、窗口 1001 行（`memos-user.ts:259-265`、`:461-476`）；被过滤行多时提前结束不发 nextPageToken（`:256-277`），通知"消失"。
- [ ] **每日回顾 cron 全表双重扇出**：全表用户 × 每用户 `listDailyReviewMemos`（`review.ts:62-81`），datetime 计算列无索引；规模上来 cron 超时。
- [ ] **random walk 每步全表**：`getRandomMemo` 全量拉用户 memo id（`review.ts:95-104`），`getWalkNextMemo` 每步再查 tag/relations（`:127-197`）。
- [ ] **memosSseEvents 无保留策略**：全仓唯一没有 retention 的 outbox 型表（webhook/embedding 都有 RETENTION_MS），protected/public 事件永久累积（`memos-sse.ts:35-44`）。

## P2-C · 前端补充发现（第二轮深挖，均在已有 P0 横向战役之外）

- [ ] **composer 粘贴竞态可丢字/丢图**：上传链落地时 `updateContent`/`appendText`/删除按钮仍从渲染时 prop 构造 draft，两次按键之间落地会覆盖刚插入的图片 markdown（`memo-composer.tsx:84-101` vs `:120-125`）。
- [ ] **删除正文图片后仍被绑回**：删除 `![](...)` 行不清 `preuploadedAttachmentNames`，发送时附件"复活"（`memo-composer.tsx:95-98` + `memo-submission.ts:21-23`）。
- [ ] **IndexedDB 一次性打开失败被永久缓存**：`databasePromise` 不复位，一次瞬时失败令整会话草稿持久化失效（`local-memo-capture.ts:405-443`）。
- [ ] **capture 重连重置 startedAt**：时长少计、`CAPTURE_MAX_DURATION_MS` 上限被重置（可约 7×上限）、每重连多开一次 ASR 计费会话（`audio-capture/controller.ts:190`、`:193-199`）；重连期间音频帧直接丢弃不缓冲（`:234-251`，转写静默空洞）。
- [ ] **离开拦截在草稿保存失败时仍放行**（`capture-page.tsx:305-312`，极端情况逐字稿丢失）；wakelock 失败完全静默（`:175-190`）；capture-status 查询失败开始按钮永久禁用无重试（`:570-580`）。
- [ ] **文稿阅读每个 timeupdate 全量重查+排序时间戳节点**（`memo-reading-view.tsx:72-75`，每秒 ~4 次 O(n log n) DOM 扫描）；`<audio>` 无 error 处理死链静默（`reading-audio-provider.tsx:222-247`）。
- [ ] **AttachmentGallery 死链无占位**（`attachment-gallery.tsx:24-39`，与正文内联图的优雅降级不一致）；详情页复制分享链接无 catch（`memo-detail-page.tsx:520-523`）。
- [ ] **路由级 lazy chunk 无 ErrorBoundary**：新部署后旧 tab 路由跳转报原始英文错误，重试按钮 `router.invalidate()` 不重拉 index.html（`router-tree.tsx` 全部 lazy 页 + `root-route.tsx:25-43`）。
- [ ] **缓存键双轨**：`getCurrentFlareMoUser` 在 admin 页用 `["me"]`、账户页用 `["current-flaremo-user"]`，改角色后 AdminPanel 的 owner 判定不更新（`admin-page.tsx:82-85`、`:104-113`）；**AdminPanel 非创建操作的错误写进只有创建弹窗渲染的槽**，弹窗关闭时错误完全不可见（`admin-page.tsx:134/145/157` vs `:406-410`）。
- [ ] **invalidate 遗漏**：memory→memo promote 不刷时间线（`memory-page.tsx:346-355`）；memo→memory 不刷记忆页（`memo-detail-page.tsx:148-156`）；改用户名不刷 meQuery/admin 列表（`account-page.tsx:110-118`）；capture 保存刷死键 `["tags"]`（`capture-page.tsx:257`）。
- [ ] **t() 未知键直接抛异常**（`i18n.tsx:1442-1443`）：动态键如 `t(\`memory.type.${...}\`)` 消费服务端枚举，后端新增枚举值时详情/记忆页渲染崩溃。
- [ ] **全局快捷键无上下文守卫**：对话框打开时按 `c` 仍抢焦点，⌘C 复制也被劫持（`App.tsx:205-212`）；`d` 主题键不在快捷键表。
- [ ] **死代码**：`captchaButtonLabel`、`slugifyHeading`、`addDays`/`compareDayKeys`、`CaptureState` 的 saving/saved、`void monthKey`（各文件行号见审计记录）。
- [ ] **用量面板无轮询/焦点刷新**，同会话内语义搜索后配额条不动（`usage-panel.tsx`）。

## 已确认不欠的账（探索时核对过，避免重复怀疑）

- schema↔迁移↔持久化清单三方对齐有门禁（`pnpm persistence:check`），无孤儿表。
- webhook 投递有 lease/重试/退避/dead-letter；SSE 有心跳与断流重试；bootstrap/recovery fail-closed；identity-cache 对授权关键行保持 live 读。
- 附件 R2 GC 四项加固（09-12）与向量分区改造（09-15）均已闭环。
- 附件 R2 key 用 uuid 段 + 文件名字符白名单消毒（`attachment-http.ts:113-115`），无路径穿越面；公开分享附件绑定校验 memoId 归属（`public-api.ts:56-59`）。
- PAT 身份链缓存撤销语义有注释与实现支撑，成员移除后 token 立即失效；离线队列/附件上传双端 client_id 幂等，重放不产生重复。
- Telegram bot webhook 有 secret 校验（`telegram-bot/src/index.ts:41-44`）；i18n zh/en 634 键零差异、无硬编码用户可见文案；全 src 无 console.log 残留。
- composer 离线队列重放幂等、SW 离线壳/range 排除/SKIP_WAITING 握手、token 生成撤销 UI 边界均正确。
