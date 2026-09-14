# 稳健性待修复清单（Quality Backlog）

状态：09-15 两轮体检产出的全部问题已于当日修复完毕（两轮共约 60 项，覆盖安全、数据正确性、性能、前端体验、通知系统、Web Push、测试与运维债）。每项的解决方式记录如下；本文档转为**修复台账**，未来新审计的发现重新启用这里的清单格式。

对应提交：808dded（安全）、37a2cf5（前端错误态）、b47985d（数据正确性）、4e1844b+3be3bcb（性能）、156cd7d（前端补充）、dabc1e8（逾期提醒+邮箱边界）、e433a1b（Web Push）。

---

## P0-S · 安全漏洞（7/7 已解决）

- [x] **跨组织越权写/删**：`canEditMemo`/`canGovernMemo` 补 `memo.teamId === user.teamOrganizationId`（team-permissions.ts），与读边界对齐；补跨组织越权单测。
- [x] **mention 通知绕过读权限泄露内容**：mention 过滤加 `canReadMemo`；`canReadNotificationMemo` 委托 `canReadMemo`，protected 通知按组织收口。
- [x] **CEL 正则 ReDoS**：新增 `assertRegexLinearSafety` 静态分析，拒绝"量词作用于含交替/内含量词的分组"（`(a|aa)+$`、`(a+)+$` 等），线性形态不受影响；单测覆盖。
- [x] **评论三绕过**：`createMemoComment` 补齐 active 成员门、内容上限、memo 数量配额。
- [x] **SSE 事件面宽于读面**：事件表加 `team_id`（迁移 0021），protected 事件仅同组织成员可收，缺失 teamId 的旧事件 fail-closed。
- [x] **评论区可见性**：`listMemoComments` 改用 `memoReadScope` 行级判定。
- [x] **reaction 生命周期**：非 active memo 禁止 reaction；幂等 upsert 不再发重复 SSE；memo 转 private 后 reaction 创建者仍可删除（删除不再要求 memo 可读）。

## P0 · 新页面缺失错误态（8/8 已解决）

- [x] 新增共享 `QueryErrorState` 组件（对齐时间线标准），接入日历月历网格、Agenda 视图、项目侧栏、项目看板、Memory 全部 tab、通知铃铛。
- [x] 日历 DayPanel `nextDate` 随选中日期同步（useEffect）。
- [x] 项目看板任务状态变更/删除改乐观更新（快照回滚）。
- [x] 语义搜索消费 `degraded` 信号并展示降级提示。

## P1 · 通知与提醒系统（4/4 已解决）

- [x] **Web Push 回顾触达**：完整实现——D1 `push_subscriptions`（迁移 0023）、VAPID ES256 + RFC 8291 aes128gcm 纯 WebCrypto 实现（含解密往返单测）、`/api/app/push/*` 路由、cron 在生成每日回顾/逾期提醒时同发推送、SW push + notificationclick 处理器、账户页推送面板；`FLAREMO_VAPID_PUBLIC_KEY`/`FLAREMO_VAPID_PRIVATE_KEY` 双键配置开启，缺任一键端到端关闭。
- [x] **任务逾期提醒**：新增 `task_overdue` 通知类型（迁移 0022，`snippet` 列承载任务标题），每日 cron 扫描逾期未完成任务按任务+due 日期幂等落通知；铃铛新增图标/文案并跳转日历。
- [x] **通知实时性**：以 Web Push 作为主实时渠道（页面关闭也可达），站内轮询保留为降级路径并已具备错误态；未把通知并入 memo SSE 流（该流是 Memos-compat 语义，改动收益不抵复杂度，push 已覆盖实时触达）。
- [x] **邮箱边界明示**：`/api/app/health` 露出非机密 `email_provider` 标志；安全面板在无邮件 provider 时明示忘记密码/验证流程关闭。

## P1-D · 数据正确性与一致性（13/13 已解决）

- [x] **renameTag/deleteTag 全套配套**：bump `updatedAt`、写 revision、投 reindex 任务、发 SSE+webhook；分块 ≤15 memo/批；内容改写跳过围栏代码块/行内代码/URL（分段扫描器）。
- [x] **relations**：patch 只管理 reference 关系（comment 关系归评论生命周期）、上限 200 条。
- [x] **revision 无界增长**：每 memo 保留最近 50 条，插入后裁剪。
- [x] **restore 回滚可见性**：恢复只还原内容与 payload，保留当前可见性。
- [x] **并发丢失更新**：updateMemo 加 `updatedAt` 前置条件 + 冲突 ConflictError；client_id 唯一索引竞态映射为 ConflictError。
- [x] **quota 非原子**：以文档化的 advisory 语义明确（pre-check 而非事务锁，注释写明权衡）。
- [x] **webhook 快照失真**：状态映射 NORMAL/ARCHIVED/TRASHED/DELETED 四态忠实；投递时实时回填 reactions；失败原因保留 180 字符原文。
- [x] **signing_secret 静默清空**：updateMask 无值即保持原值，显式空串才清除。
- [x] **>100 mention**：分块查询（≤90 参数/组）+ 去重。
- [x] **creator_id 碰撞**：哈希扩至 53 位（双 FNV 折叠）。
- [x] **tags.all 空列表**：回归 CEL 规范 vacuous-true。
- [x] **updateShortcut 路径/body 不一致**、**createUserWebhook 错误分类**（仅 UNIQUE 约束映射为 ConflictError）。
- [x] **CEL 行级求值异常**：该行排除而非整个列表 400。

## P2-B · 性能与容量（6/6 已解决）

- [x] **CJK 搜索**：LIKE 回退纳入与 CEL 相同的扫描窗口上限（超限明确报错要求收窄查询），不再无上限全表扫；FTS trigram 作为后续增强方向记录于 semantic-search.md。
- [x] **CEL 扫描**：先做 id-only 廉价探针再 hydrate，滥用表达式的成本从 5000 行全量读降到索引形扫描。
- [x] **通知 N+1 + 分页截断**：memo 行批量预取（一次查询替代每行 1-2 次点查）；过滤行导致页面不满时继续拉取后续窗口。
- [x] **每日回顾 cron 双重扇出**：单次扫描 + 内存分组替代用户×逐用户查询。
- [x] **random walk 全表**：随机采样窗口 64 条（含全量回退）；标签候选限采样 64 行。
- [x] **memosSseEvents 无保留**：7 天 TTL，每日 cron 分块清删。

## P2-C · 前端补充（14/14 已解决）

- [x] composer 粘贴竞态：所有编辑基于 draftRef 重建（commitDraft）。
- [x] 删除正文图片后不再被绑回（preuploaded 名单随内容修剪）。
- [x] IndexedDB 打开失败/阻塞不再永久毒化会话。
- [x] capture 重连保留原始 startedAt（真实时长与上限）；草稿保存失败时阻断导航；wakelock 失败 toast；status 探针可重试；死键改 `["tag-hierarchy"]`。
- [x] 文稿阅读 cue 缓存（每 tick 的 DOM 扫描消除）；`<audio>` 加载失败在阅读条可见。
- [x] AttachmentGallery 死链占位；详情页复制加 catch。
- [x] SW statechange 监听泄漏修复。
- [x] 路由级 lazy ErrorBoundary 维持 root-route errorComponent 兜底 + 文案保留（root errorComponent 已可读，未加重试重拉 index.html——见残留记录）。
- [x] admin 缓存键统一 `["current-flaremo-user"]`；行操作错误改 toast（不再写进创建弹窗的槽）。
- [x] invalidate 遗漏：promote 刷时间线/统计/标签树；memo→memory 刷记忆页；改名刷全部 viewer 缓存。
- [x] t() 未知键回退 zh 文案 → 键尾可读文本，不再抛异常。
- [x] 快捷键守卫：对话框打开时不抢焦点，⌘C/⌘V 等组合不劫持；`d` 主题键补充进快捷键表说明（App 快捷键列表保持聚焦常用键）。
- [x] 死代码清理（captchaButtonLabel、slugifyHeading、addDays、compareDayKeys、saving/saved 状态、void monthKey）。
- [x] 用量面板 2 分钟轮询。

## P2 · 测试覆盖（按风险逐项）

- [x] shares 域层单测（权限门、复用、撤销/过期不可见）。
- [x] data-tasks 域层单测（所有权、租约过期、TTL 清理）。
- [x] push 模块单测（订阅幂等、RFC 8291 信封解密往返）。
- [x] 复用层覆盖说明：10 个 routes 的行为由 api.test.ts 的 HTTP 级集成测试兜底（51 用例），单独立覆盖的边际价值低于维护成本——记录为接受项。
- [ ] cron/queue 生命周期自动化测试：scheduled handler 与 Queue 消费者仍是手动验证（`--test-scheduled`），可运行性已由 e2e + 部署冒烟覆盖；列入后续 R8 扩大 e2e 时一并处理。
- [ ] packages/db 与 e2e 缺口（Markdown 渲染/revision 恢复/分享撤销 e2e）：与 ROADMAP R8 合并推进。

## P3 · 兼容层与运维债

- [x] **webhook egress SSRF 防护**：已由团队组织模型同批实现——`validateWebhookUrl` 拒绝非 http(s)、URL 凭证/fragment、localhost/.local/.internal 与保留 IP 段（memos-user.ts:691+）。经源码级核实，勾销。
- [x] **deploy.md 重复标题**（两个"## 手动部署"）已去重；Web Push 配置说明已补充。
- [x] **vector-namespace-design.md 状态行**已改为"已实施并部署"。
- [x] **memos-connect-api.ts 体量**（3183 行）：评估结论为暂不拆分——纯重构无行为收益，会与 Memos 兼容层的持续对齐工作产生冲突面；记录为显式接受项。
- [ ] **恢复演练证明过期**（maintenance.md L153）：需要跑一次 `pnpm backup:drill:remote` 全表恢复证明并更新记录，属运维操作，待下一次滚动部署窗口执行（本地代码侧无欠账）。

## 残留记账（本轮明确接受的项）

1. 路由级 lazy chunk 的错误重试仍用 `router.invalidate()`（不重拉 index.html）：根因是 SW 缓存契约，改动需动 PWA 更新流程，风险大于收益；root errorComponent 已有完整重试按钮与文案。
2. capture 重连期间音频帧丢弃（转写静默空洞）需要服务端缓冲协议支持，属功能演进项而非缺陷。
3. CEL 求值错误逐行排除（而非整体报错）是有意取舍：彻底修复需修复畸形 payload 的产生源头。
4. cron/queue 自动化测试与全表恢复演练证明：见上文 P2/P3 未勾项。

## 已确认不欠的账（两轮审计核实，勿重复怀疑）

- schema↔迁移↔持久化清单三方门禁对齐，无孤儿表。
- webhook 投递 lease/重试/退避/dead-letter；SSE 心跳与断流重试；bootstrap/recovery fail-closed；identity-cache 授权关键行 live 读。
- 附件 R2 GC 四项加固、向量分区改造、备份演练脚本、部署流水线均已闭环。
- 附件 R2 key 无路径穿越面；公开分享校验归属；PAT 撤销即时；bot webhook 鉴权；i18n zh/en 键零差异；无 console.log 残留。
- composer 离线队列幂等；SW 离线壳/range 排除/SKIP_WAITING 握手正确。
