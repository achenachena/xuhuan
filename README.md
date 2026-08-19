# 虚环：仅一人在线

《虚环：仅一人在线》是一个面向 Telegram Mini App 的竖屏动作 Roguelite。玩家是收到异常后台消息的“最后一位在线观众”，直接操控仍保留自我意识的数字分身，对抗把角色压缩成标准人设的“留存协议”。每局约 6–8 分钟；路线、模块和战斗会重置，剧情选择、记忆和横向解锁会保留。

当前可玩版本包含完整序章与七海第一章《第七码头没有海》。其余六位角色和章节已进入版本化内容目录，后续沿用同一套系统扩展。

## 核心玩法

- Telegram 风格后台群聊承载主线、角色陪伴、分支选择和少量黑色幽默。
- 单指相对摇杆控制移动，七海自动锁定攻击；唯一主动技能“航线跃迁”承担位移、无敌帧和爆发。
- 六段分支路线包含约 35–50 秒的普通战斗、事件、精英、休整、固定剧情和三阶段 Boss。
- 顺序穿过三枚航标完成“航线”，立即刷新跃迁并强化尾流伤害。
- 擦弹提高“失真”；60 以上进入伤害过载，100 时触发掉血、清弹并回落，形成风险收益选择。
- 战后安装频道模块，最多六种、每种三级；精英额外掉落永久影响本局的频道插件。
- 新玩家只需在异常消息中点击一次“保持在线”即可直接进入约 20 秒的可操作教学。
- 服务端保存唯一 active Run；刷新页面或关闭 Telegram 后会恢复，不以浏览器存档为事实来源。

## Architecture

```text
Telegram Mini App
  └─ Next.js 16 / React 19 on Vercel
       └─ HTTPS + Telegram initData
            └─ Go REST API (Chi) on AWS Lambda Function URL
                 ├─ Neon PostgreSQL (authoritative runs, commands, story, unlocks)
                 └─ Upstash Redis (distributed rate limits only)
```

动作战斗使用 30Hz 固定步长和确定性随机流。浏览器只预测表现并记录量化输入；房间结束后提交一条 `rle8-v1` 压缩轨迹，Go 重放并裁决生命、击杀、奖励和结局。每个写请求携带幂等键和预期版本，PostgreSQL 在事务中锁定 Run、写入不可变命令历史并原子提交。关闭 Telegram 会恢复同一 Run，并从当前房间的相同种子重新开始。

API 契约见 [OpenAPI 3.1](apps/api/openapi/openapi.yaml)，更完整的信任边界、领域结构和迁移方案见 [architecture.md](docs/architecture.md)。
动作 V2 的前进式维护窗口顺序见 [action-v2-release.md](docs/action-v2-release.md)。

## Repository layout

```text
apps/
  api/                 Go V2 API、版本化内容包和测试
  miniapp/             Next.js Telegram Mini App 与静态游戏素材
docs/                  架构与发布文档
infra/                 AWS Lambda 与零固定成本基础设施 Terraform
```

## Run locally

Prerequisites: Docker Compose v2, Node.js 20+, npm 10+, and Go 1.25+（模块会选择仓库测试过的工具链）。本地运行不需要 Telegram bot token；API 仅在 `APP_ENV=development` 时允许显式开发身份。

```sh
cp env.example .env
make install
make up
```

在第二个终端运行：

```sh
make miniapp
```

打开 `http://localhost:3000`。`make down` 会停止容器但保留 PostgreSQL volume；只有明确要清空本地数据时才使用 `docker compose down --volumes`。

## Verification

```sh
make test                 # Go unit/contract/race + frontend test/lint/type/build
make test-integration     # PostgreSQL row-lock/idempotency/rollback + Redis tests
make e2e-install          # one-time Playwright Chromium install
make e2e                  # browser → API → PostgreSQL authoritative journey
```

合并生产候选版本后，手动运行 GitHub Actions 的 `Smoke Production V2`。该门禁通过 AWS OIDC 临时读取 SSM 中的 bot token，以明确标记的合成 Telegram 身份验证签名认证、断线恢复、Boss、结算剧情和噪声解锁；凭据与原始 `initData` 不会写入日志。

修改 OpenAPI 后重新生成并检查前端类型：

```sh
npm run generate:api-types --workspace @xuhuan/miniapp
npm run check:api-types --workspace @xuhuan/miniapp
```

## Migration status

`004_action_roguelite.sql` 是动作版的前进式 V2 替换：按产品决定清空现有玩家、剧情与 Run 数据，把解锁和命令约束切换为模块、插件和房间轨迹。旧卡牌内容、领域代码、UI 和协议已从主干实现中移除。该迁移执行后不能恢复旧卡牌存档；数据库问题必须前向修复。

## Configuration, security, and cost

生产 PostgreSQL、Redis 与 Telegram 凭据保存为 AWS SSM standard-tier SecureString，只注入不可变 Lambda 版本。生产构建不得暴露 `DEV_AUTH_*` 或 `NEXT_PUBLIC_DEV_AUTH_TOKEN`。API 验证原始 Telegram `initData` 的签名与时效，不信任 `initDataUnsafe`。

生产拓扑没有 VPC、NAT Gateway、API Gateway、负载均衡器、RDS、ElastiCache、ECS/EKS 或 ECR。Neon 保存 PostgreSQL 真相，Upstash 只保存可丢失的限流计数；免费额度耗尽会导致服务暂停或限流，不会自动升级付费方案。基础设施细节见 [Terraform README](infra/terraform/README.md)。

## Fan work and assets

这是一个非商业、非官方的技术演示与同人项目，与角色、团体或平台的权利方没有隶属、认可或合作关系。剧情中的角色均为架空数字分身，故事不陈述现实人物或团体事实；现实梗仅作为彩蛋。角色名称、形象及既有立绘归各自权利方所有，若权利方提出要求会移除相关素材。

- 七位角色立绘：沿用项目原有的远程素材 URL；来源信息保留在版本化内容包中。
- 第七码头背景、留存无人机、审核猎犬与“最优人格”视觉：使用 OpenAI 图像生成工具为本项目生成的原创静态素材，位于 `apps/miniapp/public/game/v1/`。
- UI、动作特效、敌人名称、剧情和系统设计：本项目原创。

本仓库不提供素材再授权，也不允许将同人素材用于商业发行。
