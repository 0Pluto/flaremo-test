# 稳健性待修复清单（Quality Backlog）

状态：09-15 首次全模块体检（后端域层/路由、前端、测试覆盖、运维文档四路并行探索）。本文是**待修复项的唯一清单**，按优先级分组，每项含证据（文件:行号）、影响与修法建议。解决一项就勾一项，全部修完可归档本文档。

整体背景：代码库工程水位偏高（后端零 TODO/FIXME，outbox+lease+dead-letter 模式一致，鉴权 fail-closed），本清单不是"写得烂"的债，而是**功能纵深短板 + 新页面没继承老页面稳健标准**两类。

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

## 已确认不欠的账（探索时核对过，避免重复怀疑）

- schema↔迁移↔持久化清单三方对齐有门禁（`pnpm persistence:check`），无孤儿表。
- webhook 投递有 lease/重试/退避/dead-letter；SSE 有心跳与断流重试；bootstrap/recovery fail-closed；identity-cache 对授权关键行保持 live 读。
- 附件 R2 GC 四项加固（09-12）与向量分区改造（09-15）均已闭环。
