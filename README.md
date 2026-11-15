<!-- RECENT_UPDATES_START -->
<table width="100%">
  <thead>
    <tr><th colspan="3" align="left">🗓 最近更新 <sub>最近 5 项 · 新的在前</sub></th></tr>
    <tr><th align="left">时间（UTC+8）</th><th align="left">开发者</th><th align="left">任务与结果</th></tr>
  </thead>
  <tbody>
    <tr>
      <td valign="top">2026-11-15<br><sub>18:14</sub></td>
      <td valign="top"><sub>MagicalNobodee<br>Codex</sub></td>
      <td><a href="https://github.com/MagicalNobodee/Sanctum-of-Ash/issues/16"><strong>调整紫晶掉落</strong></a><br>普通房紫晶平均供给减少约七成，Boss 在 75%、50%、25% 血量集中掉落，小怪越少补给越多。</td>
    </tr>
    <tr>
      <td valign="top">2026-11-15<br><sub>18:09</sub></td>
      <td valign="top"><sub>MagicalNobodee<br>Codex</sub></td>
      <td><a href="https://github.com/MagicalNobodee/Sanctum-of-Ash/issues/18"><strong>首页展示最近更新</strong></a><br>README 顶部新增最近 5 条更新卡片，下面可打开完整列表，原项目介绍保留在下方。</td>
    </tr>
    <tr>
      <td valign="top">2026-11-15<br><sub>17:44</sub></td>
      <td valign="top"><sub>MagicalNobodee<br>Codex</sub></td>
      <td><a href="https://github.com/MagicalNobodee/Sanctum-of-Ash/issues/14"><strong>缩短近战攻击距离</strong></a><br>全部 7 把近战武器及砸地连招的攻击距离缩短 20%，保留武器长短差异，更新双语说明并通过战斗测试。</td>
    </tr>
    <tr>
      <td valign="top">2026-11-15<br><sub>17:13</sub></td>
      <td valign="top"><sub>MagicalNobodee<br>Codex</sub></td>
      <td><a href="https://github.com/MagicalNobodee/Sanctum-of-Ash/issues/11"><strong>整理游戏顶部界面</strong></a><br>右上角操作统一放入 Esc 设置，状态条移至右上，并为层数和余烬补充文字说明。</td>
    </tr>
    <tr>
      <td valign="top">2026-11-15<br><sub>17:11</sub></td>
      <td valign="top"><sub>MagicalNobodee<br>Codex</sub></td>
      <td><a href="https://github.com/MagicalNobodee/Sanctum-of-Ash/issues/12"><strong>增加更新一览</strong></a><br>新增按时间倒序的更新列表，并要求 Agent 每次完成任务时补一条易读说明。</td>
    </tr>
  </tbody>
</table>
<p align="right"><a href="UPDATES.md"><strong>查看完整更新列表 →</strong></a></p>
<!-- RECENT_UPDATES_END -->

# Sanctum of Ash

暗黑写实风 3D 肉鸽地牢动作游戏（支持 **1–4 人局域网联机合作** 与单人离线直玩 · 12 大可选英雄职业 × 4 层递进深度 × 8 套模块化主题地牢 × 20 把五阶稀有度双持武器库（含 5 把首领神话武器与图鉴） · 中英双语实时切换）。

## 开始游戏

下载完整仓库后，用现代桌面浏览器打开 `outputs/sanctum-of-ash.html`，即可离线单人游玩。根目录的 `SanctumOfAsh_3DRoguelike.html` 是同一份游戏，构建时会同步更新。

联机需要安装 Node.js 20 或更新版本。在项目根目录运行 `node lan-server.mjs --open`，再把游戏内显示的局域网地址分享给同一网络的朋友。默认使用 18765 端口，占用时会尝试后续三个端口。

macOS 用户也可以双击 `outputs/余烬圣所 · Sanctum of Ash.app`。启动器会尝试启动联机服务；找不到 Node.js 时会打开离线游戏。首次运行下载的启动器时，可能需要在系统设置中允许打开。

公网邀请使用外部 SSH 隧道服务，需要联网且取决于服务可用性。仅局域网游玩可运行 `node lan-server.mjs --no-wan --open`。

## 多人开发与 Agent 协作

每位开发者只需向自己的 Agent 提修改需求，默认就授权它完成实现、测试和合入，无需另外说“允许合入”。Agent 先读 [AGENTS.md](AGENTS.md)，自行完成 [协作流程](CONTRIBUTING.md) 中的最新代码检查、认领、独立分支、自查和 PR 交付；只有实际目标冲突才需要用户确认。

每次会话任务完成，Agent 都要在 [更新一览](UPDATES.md) 补一条易读摘要、同步本页顶部最近 5 条，并新增一份 [详细改动记录](docs/changes/)；长期共识放在 [决策记录](docs/decisions/)。新建 Issue 和 PR 时会提供统一模板；开始先获取最新代码，结束核实远端交付状态。

## 目录结构

- `outputs/余烬圣所 · Sanctum of Ash.app`：双击即玩启动器（自动检测并确保局域网联机服务后台运行后打开游戏）
- `outputs/sanctum-of-ash.html`：独立可运行的完整正式版游戏文件（直接双击即可单人或局域网建房联机，内置自动发现与本地房间兜底）
- `lan-server.mjs`：零依赖后台局域网联机服务（默认端口 18765，支持自动避让冲突端口与已运行实例复用）
- `outputs/biome-showcase.html`：独立 8 套主题地牢交互式预览与接缝检查图鉴
- `work/src/`：核心游戏源码（`main.js` 主循环、`classes.js` / `class_models.js` / `class_abilities.js` 12 大职业模型与主动/被动技能、`multiplayer.js` / `coop_controller.js` 局域网联机与动态难度缩放、`floors.js` 四层推进与词缀、`weapons.js` 20 把五阶稀有度武器与鼠标锁敌、`roguelike.js` 圣物、`actors.js` 角色与粒子、`audio.js` 音效、`biomes/` 八大模块化主题地牢）
- `work/template.html`：界面与样式模板
- `work/build.mjs`：打包构建脚本
- `work/test_4floor_arsenal.py`：四层推进与武器流程测试
- `work/test_lan_multiplayer.py`：局域网联机测试（最多同时启动两个浏览器）
- `work/test_biomes.py`：8 套主题 × 多随机种子模块化接缝与通行验证脚本
- `work/requirements.txt`：浏览器测试依赖
- `PLAN.md`：开发计划和历史设计记录
- `THIRD_PARTY_NOTICES.md`：打包使用的 Three.js 许可

依赖目录、日志、缓存和自动测试截图不提交到仓库。图像、场景模型和音效的生成逻辑保留在源码中，运行成品不需要额外下载素材。

## 常用命令

```bash
# 启动联机服务并打开游戏
node lan-server.mjs --open

# 安装构建依赖，再生成游戏和主题图鉴
npm ci --prefix work
npm run build --prefix work
npm run build:biomes --prefix work

# 安装自动测试依赖
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r work/requirements.txt
python3 -m playwright install chromium

# 串行运行，避免同时启动多组浏览器
python3 work/test_balance_overhaul.py
python3 work/test_coop_sync_rules.py
python3 work/test_lan_multiplayer.py
```

部分早期测试针对旧版界面和数值，保留作开发记录，可能需要随游戏规则更新。现有浏览器测试使用 macOS 图形参数；其他系统可能需要调整浏览器启动参数。仓库不会自动安装开机后台服务。
