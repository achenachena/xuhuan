# 虚环：仅一人在线

《虚环：仅一人在线》是一个面向 Telegram Mini App 的剧情卡牌 Roguelite。玩家是收到异常后台消息的“最后一位在线观众”，需要与仍保留自我意识的数字分身同行，对抗把角色压缩成标准人设的“留存协议”。每局约 10–15 分钟；地图、牌组和战斗会重置，剧情选择、记忆和横向解锁会保留。

当前可玩版本包含完整序章与七海第一章《第七码头没有海》。其余六位角色和章节已进入版本化内容目录，后续沿用同一套系统扩展。

## 核心玩法

- Telegram 风格后台群聊承载主线、角色陪伴、分支选择和少量黑色幽默。
- 七层分支地图包含普通战斗、事件、精英、休整、固定剧情和 Boss。
- 每回合抽 5 张牌并获得 3 点带宽；敌人提前显示意图，最多同时出现两个敌人。
- 攻击、防御、信号和故障四类牌支持目标、状态、抽弃牌、移除和资源操作。
- “失真”是风险收益资源；达到上限会掉血、加入乱码牌并部分回落。
- 七海在同一回合打出攻击、防御、信号后完成“航线”，获得航标并抽牌。
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

战斗、地图和敌人意图由纯函数及确定性随机流推进；客户端只提交 `choose_node`、`play_card`、`end_turn` 等命令。每个写请求携带幂等键和预期版本，PostgreSQL 在事务中锁定 Run、验证版本、写入不可变命令历史并原子提交。内容包版本会随 Run 保存，因此后续平衡调整不会改变已有存档。

API 契约见 [OpenAPI 3.1](apps/api/openapi/openapi.yaml)，更完整的信任边界、领域结构和迁移方案见 [architecture.md](docs/architecture.md)。

## Repository layout

```text
apps/
  api/                 Go API、V1/V2 兼容迁移、内容包和测试
  miniapp/             Next.js Telegram Mini App 与静态游戏素材
packages/
  game-types/          兼容阶段保留的 V1 展示类型
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

修改 OpenAPI 后重新生成并检查前端类型：

```sh
npm run generate:api-types --workspace @xuhuan/miniapp
npm run check:api-types --workspace @xuhuan/miniapp
```

## Compatibility rollout

本次重制使用两阶段发布：

1. `002_story_roguelite.sql` 会按产品决定清空旧玩家与旧玩法数据，添加 V2 表和 API，但保留空的 V1 表及端点，确保旧 Lambda 版本仍能被别名回滚。
2. V2 Mini App 在生产完成迁移、恢复、Boss 和剧情选择验证后，才会另开迁移删除 V1 API、旧战斗目录、旧种子目录和旧数据库表。

不要在第一阶段提前删除 V1 表；那会破坏 Lambda 版本回滚。

## Configuration, security, and cost

生产 PostgreSQL、Redis 与 Telegram 凭据保存为 AWS SSM standard-tier SecureString，只注入不可变 Lambda 版本。生产构建不得暴露 `DEV_AUTH_*` 或 `NEXT_PUBLIC_DEV_AUTH_TOKEN`。API 验证原始 Telegram `initData` 的签名与时效，不信任 `initDataUnsafe`。

生产拓扑没有 VPC、NAT Gateway、API Gateway、负载均衡器、RDS、ElastiCache、ECS/EKS 或 ECR。Neon 保存 PostgreSQL 真相，Upstash 只保存可丢失的限流计数；免费额度耗尽会导致服务暂停或限流，不会自动升级付费方案。基础设施细节见 [Terraform README](infra/terraform/README.md)。

## Fan work and assets

这是一个非商业、非官方的技术演示与同人项目，与角色、团体或平台的权利方没有隶属、认可或合作关系。剧情中的角色均为架空数字分身，故事不陈述现实人物或团体事实；现实梗仅作为彩蛋。角色名称、形象及既有立绘归各自权利方所有，若权利方提出要求会移除相关素材。

- 七位角色立绘：沿用项目原有的远程素材 URL；来源信息保留在版本化内容包中。
- 第七码头背景、留存无人机、审核猎犬与“最优人格”视觉：使用 OpenAI 图像生成工具为本项目生成的原创静态素材，位于 `apps/miniapp/public/game/v1/`。
- UI、卡牌符号、敌人名称、剧情和系统设计：本项目原创。

本仓库不提供素材再授权，也不允许将同人素材用于商业发行。
