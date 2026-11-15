<!-- RECENT_UPDATES_START -->
<table width="100%">
  <thead>
    <tr><th colspan="3" align="left">🗓 最近更新 <sub>最近 5 项 · 新的在前</sub></th></tr>
    <tr><th align="left">时间（UTC+8）</th><th align="left">开发者</th><th align="left">任务与结果</th></tr>
  </thead>
  <tbody>
    <tr>
      <td valign="top">2026-11-15<br><sub>18:32</sub></td>
      <td valign="top"><sub>MagicalNobodee<br>Codex</sub></td>
      <td><a href="https://github.com/MagicalNobodee/Sanctum-of-Ash/issues/22"><strong>补齐 Mac 与 Windows 兼容</strong></a><br>新增双平台启动入口，修复后台路径和测试限制，并加入两平台离线开局与双人联机自动检查。</td>
    </tr>
    <tr>
      <td valign="top">2026-11-15<br><sub>18:16</sub></td>
      <td valign="top"><sub>MagicalNobodee<br>Codex</sub></td>
      <td><a href="https://github.com/MagicalNobodee/Sanctum-of-Ash/issues/9"><strong>修复异地联机恢复</strong></a><br>补齐无法直连时的动作转发、失联检测和原房间恢复，增加免费通道验证与切换；免费公网可用性和延迟仍受网络影响。</td>
    </tr>
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
  </tbody>
</table>
<p align="right"><a href="UPDATES.md"><strong>查看完整更新列表 →</strong></a></p>
<!-- RECENT_UPDATES_END -->

# Sanctum of Ash

暗黑写实风 3D 肉鸽地牢动作游戏（支持 **1–4 人局域网联机合作** 与单人离线直玩 · 12 大可选英雄职业 × 4 层递进深度 × 8 套模块化主题地牢 × 20 把五阶稀有度双持武器库（含 5 把首领神话武器与图鉴） · 中英双语实时切换）。

## 开始游戏

macOS 和 Windows 均可用支持 WebGL 2 的现代桌面浏览器游玩，建议使用新版 Chrome 或 Edge。下载完整仓库后，打开 `outputs/sanctum-of-ash.html`，即可离线单人游玩。根目录的 `SanctumOfAsh_3DRoguelike.html` 是同一份游戏，构建时会同步更新。

联机需要安装 Node.js 20 或更新版本。在项目根目录运行 `node lan-server.mjs --open`，再把游戏内显示的局域网地址分享给同一网络的朋友。默认使用 18765 端口，占用时会尝试后续三个端口。

macOS 用户也可以双击 `outputs/余烬圣所 · Sanctum of Ash.app`。启动器会尝试启动联机服务；找不到 Node.js 时会打开离线游戏。首次运行下载的启动器时，可能需要在系统设置中允许打开。

Windows 用户双击 `outputs/Start-Sanctum.cmd`；macOS 也可双击 `outputs/Start-Sanctum.command`。这两个入口会打开游戏并在命令窗口运行联机服务，作为房主时保留窗口，按 Ctrl+C 停止。未安装 Node.js 时提示安装并打开离线游戏。完整目录需保留，不能只复制启动器；单人离线只需 HTML。

Windows 首次启动联机时，如果系统询问是否允许 Node.js 通过防火墙，请允许当前可信的专用网络。双方应在可互访的同一网络；访客 Wi-Fi、网络隔离和系统防火墙可能阻止局域网连接。SSH 公网通道需要 `ssh`（macOS 自带，Windows 可安装系统的 OpenSSH 客户端）；缺少它不影响离线与局域网。

异地好友使用大厅里的“异地好友网址”。房主会依次尝试免费的 Cloudflare、Serveo、localhost.run 通道，确认网页和联机连接确实能返回本机后才显示可用；Cloudflare 需要本机已安装 `cloudflared`，缺失时自动尝试后续通道。仅局域网游玩可运行 `node lan-server.mjs --no-wan --open`。

直连可用时自动加速，无法直连时使用网页通道转发动作。短暂断网会尝试恢复原房间，服务端保留原名额 45 秒；主动退出不重连。免费通道可能慢、失效或换网址，无法保证大陆与香港的所有网络均低延迟；若通道网址已变且直连也已断开，好友需要房主的新邀请链接。更新后房主和好友都重新打开游戏，才能完整使用新的恢复功能。

## 多人开发与 Agent 协作

每位开发者只需向自己的 Agent 提修改需求，默认就授权它完成实现、测试和合入，无需另外说“允许合入”。Agent 先读 [AGENTS.md](AGENTS.md)，自行完成 [协作流程](CONTRIBUTING.md) 中的最新代码检查、认领、独立分支、自查和 PR 交付；只有实际目标冲突才需要用户确认。

每次会话任务完成，Agent 都要在 [更新一览](UPDATES.md) 补一条易读摘要、同步本页顶部最近 5 条，并新增一份 [详细改动记录](docs/changes/)；长期共识放在 [决策记录](docs/decisions/)。新建 Issue 和 PR 时会提供统一模板；开始先获取最新代码，结束核实远端交付状态。

## 目录结构

- `outputs/余烬圣所 · Sanctum of Ash.app`：双击即玩启动器（自动检测并确保局域网联机服务后台运行后打开游戏）
- `outputs/Start-Sanctum.cmd` / `outputs/Start-Sanctum.command`：Windows / macOS 命令窗口启动入口
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

# macOS 安装自动测试依赖
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r work/requirements.txt
python3 -m playwright install chromium

# 串行运行，避免同时启动多组浏览器
python3 work/test_balance_overhaul.py
python3 work/test_coop_sync_rules.py
python3 work/test_lan_multiplayer.py
python3 work/test_network_recovery.py
# 要求真实直连也通过时使用：
python3 work/test_network_recovery.py --require-p2p
# 需要外网，验证免费邀请网址及实际动作转发：
python3 work/test_wan_multiplayer.py
```

Windows PowerShell 的测试环境安装与运行（不需要修改执行策略或激活脚本）：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r work/requirements.txt
.\.venv\Scripts\python.exe -m playwright install chromium
.\.venv\Scripts\python.exe work/test_platform_browser.py
```

浏览器测试会按系统选择图形设置，自动测试机器使用软件绘图；两平台持续检查构建、服务启动、离线开局和双人同步。跨平台冒烟测试为 `python3 work/test_platform_browser.py`，只使用一个浏览器、两个独立玩家环境和临时端口。它不代替不同电脑之间的真实网络、显卡与系统弹窗验收。部分早期测试针对旧版界面和数值，保留作开发记录，可能需要随游戏规则更新。仓库不会自动安装开机后台服务。
