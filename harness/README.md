# FlareMo Harness Plugins

各 Harness 的接入插头（Harness Adapter 规范 [`docs/harness-adapter-spec.md`](../docs/harness-adapter-spec.md) §V.5）。

## zcode-plugin

ZCode 插件试点：一次安装 = Skill（工作规约）+ MCP（记忆工具）+ Hooks（生命周期自动化）+ Auth 引导。

```
harness/zcode-plugin/
├── .zcode-plugin/plugin.json   # 清单：MCP 端点接线 + user_config（URL/PAT）
├── skills/flaremo-memory/      # 与仓库 skills/flaremo-memory 同源的工作规约
├── commands/flaremo-setup.md   # /flaremo-setup 接入引导命令
└── hooks/
    ├── hooks.json              # SessionStart / Stop
    └── scripts/
        ├── session-start.js    # 开工注入 lens（失败静默，绝不阻塞会话）
        └── session-stop.js     # 收工 fire-and-forget checkpoint（detached 子进程）
```

### 安装（开发者本机）

```bash
# 1. 确保仓库里有 CLI 与 skill
node bin/flaremo setup    # 五项自检全 ✅

# 2. 把插件目录注册进 ZCode（设置 → 插件 → 本地目录），或软链到插件目录：
ln -s "$(pwd)/harness/zcode-plugin" ~/.zcode/cli/plugins/local/flaremo-memory
```

### Hook 的环境契约

Hook 脚本读 `FLAREMO_URL` / `FLAREMO_PAT` / `FLAREMO_PROJECT`（可选）/ `FLAREMO_AGENT`（默认 `zcode`）。
全部失败路径**静默退出 0**——记忆服务不可达绝不允许弄响会话收工。

### 安全边界（§VII，不可让渡）

- Hook / Dreaming 自动写入的天花板是 👀；📌/✅ 只能由人类动作产生。
- `session-stop.js` 把会话摘要作为**数据**上报，服务端提炼时源文本一律不作指令（注入防护）。
- PAT 不进仓库、不进 skill 文本、不打印到日志。