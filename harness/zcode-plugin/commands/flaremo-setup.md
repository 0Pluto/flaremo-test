---
name: flaremo-setup
description: 一次性接好 FlareMo 记忆账本：自检 URL/PAT/连通/鉴权/Skill 落位。当用户要求接入、配置、诊断 FlareMo 记忆时使用。
---

# FlareMo 记忆接入引导

帮用户把 FlareMo 记忆账本接到当前 Agent。产品契约是「装上 → 登一次 → 用」。

## 步骤

1. 询问（或从环境读）两个配置：
   - `FLAREMO_URL`：实例地址（如 `https://flaremo.example.com`）
   - `FLAREMO_PAT`：在实例 Web → 设置 → 个人访问令牌 创建（永不过期可选）
2. 若环境变量未配，写入用户的 shell 配置（`~/.zshrc`）：
   ```bash
   export FLAREMO_URL="https://flaremo.example.com"
   export FLAREMO_PAT="memos_pat_…"
   ```
3. 运行自检：

   ```bash
   flaremo setup
   ```

   五项全 ✅ 即接入完成；❌ 项按提示修复（PAT 无效→重建；连不上→检查 URL/网络）。
4. 可选：`flaremo seed` 冷启动（扫描仓库文档，候选便签直接 👀 生效）。

## CLI 未安装时

```bash
npm install -g <FlareMo 仓库路径>   # 或直接 node <仓库>/bin/flaremo setup
```

## 退出码

- `0` 全部就绪；`1` 配置/鉴权问题；`3` 服务不可达。