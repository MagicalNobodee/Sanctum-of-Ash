# 敌方紫色子弹改为红色

## 任务
关联 Issue #4；负责人 MagicalNobodee；Agent 会话 red-enemy-projectiles-20261115。
开始基线：b2da142f2f98d7d4472b1af32ebbe4754e1c5fc4。

## 改动
将敌方子弹默认颜色、侍祭实际发射颜色及发射闪光从紫色调整为红色 `0xff3322`。子弹本体与光晕共用该颜色，现有联机转发会传递相同颜色。紫色能量球及 Boss 既有橙红色攻击保留；伤害、速度和联机协议不变。重新构建两个游戏 HTML，主题展示产物无差异。

## 验证
macOS，单个无头 Chromium / Metal WebGL，独立文件页面，无共享服务操作。

- `npm ci --prefix work`：通过，无已知依赖漏洞。
- `npm run build --prefix work`、`npm run build:biomes --prefix work`：通过。
- `python3 -m unittest discover -s scripts -p 'test_*.py'`：12 项通过。
- `node --check lan-server.mjs`、`node --check work/src/main.js`：通过。
- `node --test work/test_multiplayer_watchdog.mjs`：1 项通过。
- 浏览器专项检查：进入游戏，生成侍祭并执行真实攻击更新，断言子弹本体、光晕、存储颜色与发射闪光均为红色；默认子弹伤害和速度不变。截获主机攻击消息后交给真实联机接收回调，确认接收端子弹为同样红色。生成能量球确认颜色仍为 `0xc77dff`。页面无脚本异常，打开截图确认红色子弹与紫色能量球可区分。
- 作者自查：源码仅三处颜色替换，无战斗规则或协议变更。

## 未完成与风险
未运行完整双人联机及战斗平衡回归：本次只改显示颜色，已专项覆盖发射与联机接收显示。PR 合入状态以 GitHub 为准。
