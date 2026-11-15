# 开发者与 Agent 协作流程

先读 [AGENTS.md](AGENTS.md)。本流程适用于不同开发者使用不同 Agent、各自电脑或同机多会话开发；无需统一模型，也不依赖某个聊天工具。

## 共同事实放在哪里

| 内容 | 位置 | 谁更新 |
| --- | --- | --- |
| 当前有效规则 | 根目录 `AGENTS.md` | 经 PR 合入后对所有任务生效 |
| 任务目标、认领、阻碍、交接 | GitHub Issue | 任务负责人及获授权协作者 |
| 实现、测试、审阅、合入 | GitHub Pull Request | 实现者、审阅者、集成者 |
| 每次交付的事实 | `docs/changes/` 下每个 PR 独立文件 | 实现者新增，后续不覆写 |
| 长期决定及取舍 | `docs/decisions/` | 提案者经 PR 确认 |

任务负责人由人类开发者担任，对范围和验收负责；实现者可以是其 Agent；审阅者检查结果；集成者负责合入和收尾。同一人可兼任多个角色，涉及高风险变更时按 `AGENTS.md` 使用独立审阅。这里的角色不会自动授予 GitHub 权限或对外发消息的权限。

## 一次任务的完整路径

1. 在 GitHub 用 **Agent 协作任务** 模板建立 Issue，或接手已有 Issue。先确认目标、允许修改的范围、不做什么和验收条件；同时读取未完成的相关 PR。
2. 检查本地状态并同步远端。新任务使用独立分支；当前目录有其他工作时，另建 worktree，不把别人的修改带走或自动暂存。
3. 指派任务负责人，在 Issue 留下 `CLAIM`，再读取最新讨论确认没有同范围认领。Issue 指派和留言是协调约定，不是原子锁；同时认领时由负责人划分范围，不能把抢先留言当成覆盖别人代码的许可。
4. 小范围开发；发现需求或接口变化先更新任务范围。耗时任务在阶段完成、范围改变、遇阻或交接时更新状态，无需每几分钟刷屏。
5. 验证后新增改动记录，提交任务文件，推送分支并打开 PR，在 PR 中关联 `Closes #编号`。未完成但需要交接时可推送 Draft PR，明确未完成项，不写 `Closes`。
6. 审阅者核对目标、实际实现、关联代码和测试证据；发现问题用 `REVIEW` 指向具体位置与重现方法。新提交后审阅新差异，不能沿用旧版本的通过结论。
7. 获得合入授权后，集成者同步最新 `main`、复验受影响内容、等待自动检查通过，按已审阅的分支 HEAD 合入。若基线再次前进，返回同步验证步骤。
8. 确认 PR 状态为 `MERGED`、远端 `main` 包含合入提交，再用 `DONE` 更新 Issue/向用户交付链接。其他进行中的任务在下次继续时先获取该结果。

没有网络、GitHub 权限或必要的独立审阅时，可以保存并推送已获授权的工作，但状态应是“待同步/待审阅/待合入”，不能伪报完成。

## 安全的同步命令示例

以下新任务示例假设远端名为 `origin`，任务编号为 `123`。编号和分支名按实际任务替换。所有命令运行前先检查当前目录与状态，不要盲贴。

```bash
git status --short --branch
git remote -v
git fetch origin

# 在独立目录开始新任务；不要在他人的共享目录切换分支
git worktree add -b codex/123-short-description ../sanctum-task-123 origin/main
cd ../sanctum-task-123
git rev-parse HEAD
```

已在自己的任务分支完成改动后：

```bash
git diff
# 只暂存本任务文件；此处是示例路径，请替换
git add -- work/src/floors.js docs/changes/YYYY-MM-DD-task-123.md
git diff --cached
git commit -m "fix: describe the task result (#123)"

git fetch origin
git merge origin/main
# 在这里重新运行受影响的检查；若有冲突，解决后也要重测
git push -u origin HEAD
```

用 GitHub 页面或 `gh pr create` 创建 PR。正文使用仓库模板，包含任务、基线、验证和改动记录。合入者最后核对最新远端基线与 PR HEAD；命令行可使用 `gh pr merge <编号> --squash --match-head-commit <已审阅HEAD>`，前提是审阅和检查已满足，且已获合入授权。该参数只固定 PR HEAD；防止基线竞争还需 GitHub 的严格状态检查或合并队列。

禁止 `git add .`、共享分支强推、为同步而清空目录，或自动丢弃不属于本任务的改动。仅凭 GitHub 网页显示“可合并”不能代替同步后的验证。

## Agent 消息与交接协议

在获授权更新的 Issue/PR 中使用下表的类型；每条只需填写本次有关内容。无需创建另一个共享状态表。

| 类型 | 何时使用 | 最少内容 |
| --- | --- | --- |
| `CLAIM` | 认领任务 | 人类负责人、Agent 会话标识、分支、基线 SHA、文件/函数范围、验收条件 |
| `UPDATE` | 阶段完成或范围变化 | 已完成、接下来做什么、接口影响、是否与其他任务重叠 |
| `BLOCKED` | 确有外部阻碍 | 阻碍、已尝试什么、需要谁提供什么；可独立推进的部分继续 |
| `HANDOFF` | 换开发者或会话 | 分支/PR、最新提交、已修改文件、测试结果、未完成项、下一步命令 |
| `REVIEW` | 提交审阅结果 | 被审阅 HEAD、通过项或阻塞问题、独立审阅/作者自查的真实身份 |
| `DONE` | 已合入 | PR、合入提交、验证结果、剩余风险、后续任务 |

可复制的交接正文：

```text
HANDOFF #123
负责人：GitHub 用户名；Agent 会话：本任务自定标识（不包含账号资料）
分支 / PR：
基线 SHA / 当前 HEAD：
修改范围与结果：
验证命令、结果、运行环境：
未完成与风险：
接手后第一步：git fetch origin，然后核对该分支与最新 main
```

空白、过期的 CLAIM 或失联不代表可以抢占。接手时由负责人确认交接，或明确拆成不重叠范围。公共接口约定必须进入仓库文件或 PR，不能只在 Agent 的私有记忆中。

## 验证对照表

所有 PR 都运行 `collaboration / verify` 自动检查：改动记录格式与追加规则、协作检查器自测、联机轻量单测、服务语法检查、两种构建及三个生成文件的一致性。自动检查不证明游戏画面或联机实玩正确。

| 改动范围 | 除自动检查外需要的验证 |
| --- | --- |
| 纯文档、任务模板 | 检查链接、命令是否符合当前仓库；不要求运行游戏 |
| 游戏源码 / 模板 / 依赖 / 构建 | `npm ci --prefix work`；`npm run build --prefix work`；`npm run build:biomes --prefix work`；执行对应功能测试 |
| 数值 / 战斗 / 难度 | `python3 work/test_balance_overhaul.py`，检查实际新规则的断言，不机械接受旧断言 |
| 联机 / 掉落 / 房间同步 | `node --test work/test_multiplayer_watchdog.mjs`；按范围串行运行 `python3 work/test_coop_sync_rules.py`、`python3 work/test_lan_multiplayer.py` |
| 地牢 / 主题 / 接缝 | `python3 work/test_biomes.py`，并验证受影响地形 |
| 职业 / 武器 / 楼层 | 按范围选择 `work/test_class_roster_12.py`、`work/test_4floor_arsenal.py`；先核对脚本与当前界面是否一致 |
| 协作检查脚本 / 自动检查 | `python3 -m unittest discover -s scripts -p 'test_*.py'`；验证应通过和应拒绝两种情况 |

浏览器测试环境安装见 [README](README.md#常用命令)。部分历史测试使用旧界面或固定端口，运行前先读脚本，确保不会复用/停止其他任务的服务；必要时先给脚本增加独立端口。不要同时执行多组浏览器测试。测试断言过期时明确说明并按已确认的新规则修正，不跳过后宣称通过。

自动构建会更新 `outputs/sanctum-of-ash.html`、根目录 `SanctumOfAsh_3DRoguelike.html` 和 `outputs/biome-showcase.html`。CI 重建后发现差异就失败；在本地重新构建并提交差异。CI 不启动浏览器或常驻服务。

## 改动记录模板

每个 PR 新建一个 `docs/changes/YYYY-MM-DD-<任务简述>.md`；文件名使用英文小写、数字和连字符，同日用不同任务编号避免撞名。GitHub 文件夹、PR 和 Git 历史就是索引，无需多人维护总日志。不要把本文件的空模板直接当成交付。

```markdown
# 简短标题

## 任务
关联 Issue / PR 或用户明确委托；负责人；开始时的基线 SHA。

## 改动
修改了什么、解决了什么、影响范围；重要决定链接。

## 验证
实际执行的命令、运行环境、结果；没有执行的检查及原因。

## 未完成与风险
没有则明确写“无”；否则写清影响、后续动作和负责人。
```

记录描述交付分支上的事实，合入状态以 GitHub 为准。无需在文件里填写它自身的提交 SHA 或事后补写 PR 编号；PR 正文链接该文件即可追溯，避免循环修改记录。

## 长期共识怎么修改

行为规则直接修改 `AGENTS.md`，流程直接修改本文件；涉及公共接口、兼容性、开发方式等长期取舍，在 `docs/decisions/` 新增递增编号的决定，写明状态、背景、决定、影响和替代关系。提出中的决定放 Draft PR；合入 `main` 后才生效，取代旧决定时保留旧文件并在新决定中引用。

本仓库已为 `main` 启用分支保护：必须通过 PR 合入、`verify` 检查通过、基线保持最新、讨论已解决；禁止强推和删除，管理员也受限制。GitHub 展示的工作流为 `collaboration`，必需检查的名称为 `verify`。这些是 GitHub 平台设置，不会随着克隆或复制本仓库自动带到别处。

平台目前不强制最低审批人数，以允许纯文档等低风险任务由作者自查后交付；`AGENTS.md` 中高风险变更的独立审阅要求仍必须执行。未来需要全体变更均由另一位开发者批准时，维护者可在 GitHub Settings → Branches 的 `main` 保护规则中将最低审批人数改为 1。自动检查不能证明 Agent 真的读过最新代码或独立审阅过。
