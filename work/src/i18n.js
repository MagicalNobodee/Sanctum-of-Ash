// Complete Bilingual Localization (Simplified Chinese 'zh' & English 'en')

const STORAGE_KEY = 'sanctum_of_ash_lang';

let currentLang = 'zh';
try {
  const saved = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'zh' || saved === 'en') currentLang = saved;
} catch (_) {
  // Ignore storage restrictions on file:// origins
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang === 'en' ? 'en' : 'zh';
  try {
    if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, currentLang);
  } catch (_) {}
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  }
  return currentLang;
}

export function toggleLang() {
  return setLang(currentLang === 'zh' ? 'en' : 'zh');
}

export const ENEMY_NAME_I18N = {
  thrall:     { zh: '亡灵卫士', en: 'Hollow Thrall' },
  stalker:    { zh: '暗影猎手', en: 'Shadow Stalker' },
  acolyte:    { zh: '虚空侍僧', en: 'Void Acolyte' },
  juggernaut: { zh: '重装巨锤兵', en: 'Iron Juggernaut' },
  warden:     { zh: '深渊守卫', en: 'Sanctum Warden' }
};

export function getEnemyName(type) {
  const entry = ENEMY_NAME_I18N[type];
  if (!entry) return type || '';
  return currentLang === 'zh' ? entry.zh : entry.en;
}

export const UI_STRINGS = {
  zh: {
    pageTitle: '余烬圣所 · Sanctum of Ash',
    sysLang: '语言: 中文',
    sysMapOn: '地图 [M]',
    sysMapOff: '地图: 关',
    sysGfxUltra: '画质: 极高',
    sysGfxHigh: '画质: 高',
    sysAudioOn: '音效: 开',
    sysAudioOff: '音效: 关',
    sysAudioVol: (pct) => `音效: ${pct}%`,
    sysPauseBtn: '菜单 [ESC]',
    sysFullEnter: '全屏',
    sysFullExit: '退出全屏',

    titleKicker: '四层深渊迷宫 · 八大随机秘境 · 二十神兵五阶动作肉鸽',
    titleMain: '余烬圣所',
    titleSub: '深入四层随机地下圣殿，收集跨越五大固定品阶的 20 把奇门神兵——从回旋飞轮、极光射线、发条炮台、太虚飞剑到仅限讨伐首领掉落的传说禁器，构筑独属你的战斗流派。',
    ctrlMove: '移动探索',
    ctrlSwap: '切换主副武器',
    ctrlAttack: '普攻 / 锁定射击',
    ctrlSkill: '武器战技',
    ctrlDash: '暗影冲刺',
    ctrlInteract: '交互 / 拾取 / 传送',
    ctrlFlask: '饮用猩红圣药',
    ctrlWheel: '滚轮快切武器',
    btnStart: '踏入第一层圣所',
    btnLanLobby: '局域网联机 (1-4人)',
    btnCompendium: '神殿兵装图鉴 [B] · 20件',
    btnRetry: '开启新一轮远征',
    btnRetryWaitHost: '等待房主开启新一轮远征…',
    btnEndLobby: '返回联机大厅',
    btnEndTitle: '返回主界面 [ESC]',
    btnTitleLang: '切换语言 · 中文 / English',

    lanKicker: '同网 & 异地跨网联机 · 1-4人深渊协作',
    lanHeader: '余烬圣所 · 多人联机大厅',
    lanSub: '支持同 Wi‑Fi 毫秒级直连与异地好友公网网址一键进房（最多 4 人），自动建立点对点直连加速、同步四层随机种子与倒地互救。',
    lanServerLabel: '联机服务地址',
    lanNameLabel: '骑士呼号',
    lanColorLabel: '徽记配色',
    lanCreateBtn: '创建联机房间',
    lanJoinPlaceholder: '输入房间码或粘贴邀请链接',
    lanJoinBtn: '加入房间',
    lanRefreshBtn: '刷新列表',
    lanBackBtn: '返回主界面',
    lanActiveRoomsTitle: '当前可加入的公开房间',
    lanNoRooms: '暂无公开房间 — 点击「创建联机房间」建立小队，自动生成同 Wi‑Fi 与异地好友专属网址',
    lanServerHint: '联机服务已自动就绪 · 建房后可直接复制「异地好友网址」发给外地朋友点开即玩',
    lanRoomCodeLabel: '房间码',
    lanShareUrlLabel: '同 Wi‑Fi 链接',
    lanWanShareUrlLabel: '异地好友网址',
    lanCopyCodeBtn: '复制房间码',
    lanCopyUrlBtn: '复制同网链接',
    lanCopyWanUrlBtn: '复制异地网址',
    lanEnableWanUrlBtn: '生成异地网址',
    lanWanGenerating: '正在生成公网联机网址（约 3 秒）…',
    lanWanIdleHint: '点击右侧按钮即可开启跨网公网网址',
    lanWanRefreshTitle: '重新生成异地公网网址',
    lanCopied: '已复制 ✓',
    lanReadyBtn: '准备就绪',
    lanUnreadyBtn: '取消准备',
    lanLaunchBtn: '确认开始 · 进入选角',
    lanWaitHostBtn: '等待房主确认开始…',
    lanWaitReadyBtn: '等待全部队友准备就绪…',
    lanLeaveBtn: '离开房间',
    lanHostTag: '房主',
    lanYouTag: '你',
    lanReadyTag: '已准备 ✓',
    lanNotReadyTag: '准备中…',
    lanEmptySlot: '空位 · 等待同伴加入',
    lanOpenJoinBtn: '一键加入',
    lanRoomMeta: (cur, max, inGame) => `${cur}/${max} 人 · ${inGame ? '远征进行中' : '大厅准备中'}`,
    lanScalePreview: (sc) => `难度「${sc.diffCfg ? sc.diffCfg.zhName : '标准'}」 · ${sc.playerCount} 人协作 · 小怪生命 ${sc.mobHpMult.toFixed(2)}x · 首领生命 ${sc.bossHpMult.toFixed(2)}x · 怪群规模 ${Math.round((sc.spawnMult || 1) * 100)}% (+${sc.extraSpawns}) · 余烬收益 ${sc.cinderMult.toFixed(2)}x`,
    soloScalePreview: (sc) => `难度「${sc.diffCfg ? sc.diffCfg.zhName : '标准'}」 · 单人远征 · 小怪生命 ${sc.mobHpMult.toFixed(2)}x · 首领生命 ${sc.bossHpMult.toFixed(2)}x · 怪群规模 ${Math.round((sc.spawnMult || 1) * 100)}% (+${sc.extraSpawns}) · 余烬收益 ${sc.cinderMult.toFixed(2)}x`,
    lanStatusConnected: (ping) => `局域网已就绪 (${ping}ms)`,
    lanStatusConnectedWanReady: (ping) => `局域网已就绪 · 异地已通 (${ping}ms)`,
    lanStatusWanClient: (ping) => `异地联机已连接 (${ping}ms)`,
    lanStatusP2PActive: (ping) => `异地 P2P 直连加速 (${ping}ms)`,
    lanStatusEmbedded: '本地房间已就绪',
    lanStatusConnecting: '正在自动连接联机服务…',
    lanStatusReconnecting: '连接中断，正在返回原房间…',
    lanStatusReconnectingDirect: '直连仍在同步，正在恢复房间连接…',
    lanStatusOffline: '单人离线就绪',
    lanErrConnect: '未能连接至目标房间主机，请确认房主游戏仍处于开启状态或核对邀请网址',
    lanErrResume: '原房间已失效，请使用房主最新的邀请网址重新加入',
    lanErrDelivery: '部分操作未能送达，请检查网络连接',
    lanErrNotFound: (code) => `未找到房间「${code}」，请核对房间码`,
    lanErrFull: (code) => `房间「${code}」已满员（最多 4 人）`,

    hudCoopPill: (n, mult) => `⚔ ${n}人 · ${mult.toFixed(2)}x`,
    hudCoopTooltipTitle: (n, mult) => `${n}人局域网协作 · 动态难度 ${mult.toFixed(2)}x`,
    hudCoopTooltipBody: (sc) => `普通怪生命 ${sc.mobHpMult.toFixed(2)}x · 首领生命 ${sc.bossHpMult.toFixed(2)}x · 符文护盾 ${sc.shieldMult.toFixed(2)}x · 敌方伤害 ${sc.dmgMult.toFixed(2)}x · 额外刷怪 +${sc.extraSpawns} · 余烬收益 ${sc.cinderMult.toFixed(2)}x`,
    partyAlive: '作战中',
    partyDowned: (sec) => `倒地 ${Math.ceil(sec)}s`,
    partyReviving: (pct) => `救援中 ${Math.round(pct * 100)}%`,
    downedBannerTitle: '重伤倒地 · 等待队友救援',
    downedBannerSub: (sec, pct) => pct > 0
      ? `队友正在扶起你（${Math.round(pct * 100)}%）—— 坚持住！`
      : `靠近的队友可按 [F] 将你扶起 · 失血倒计时 ${Math.ceil(sec)} 秒（可缓慢爬行）`,
    bannerAllyDownTitle: (name) => `${name} 重伤倒地！`,
    bannerAllyDownSub: '靠近倒地队友光圈并按 [F] 将其扶起',
    bannerAllyRevivedTitle: (name) => `${name} 已重返战场！`,
    bannerAllyRevivedSub: '恢复 50% 生命值并获得短暂神圣庇护',
    floatRevived: '救援成功！+50% 生命',
    floatDowned: '重伤倒地！',
    floatAllyEquipped: (pName, wName) => `${pName} 装备「${wName}」`,
    floatPartyJoin: (pName) => `${pName} 加入了小队`,
    floatPartyLeave: (pName) => `${pName} 离开了小队`,
    floatRoomRallied: (pName) => `跟随 ${pName} 集结至房间入口`,
    floatClaimedByAlly: (pName) => `已被 ${pName} 抢先开启`,
    floatLootGone: '已被队友抢先获取',

    hudVitality: '生命',
    hudFoesRemain: (n) => `剩余 ${n} 敌`,
    hudChamberClear: '安全',
    hudFloorShort: (roman, biomeName) => `第 ${roman}/IV 层 · ${biomeName}`,
    hudMapTitle: (roman) => `第 ${roman} 层`,
    hudStatsLine: (dmgBonusPct, critPct) => `伤害 ${dmgBonusPct >= 0 ? '+' : ''}${dmgBonusPct}% · 暴击 ${critPct}%`,
    hudMeleeShort: '近战',
    hudRangedShort: '远程锁定',
    hudPrimaryMelee: '挥砍',
    hudPrimaryRanged: '锁定射击',
    hudDash: '冲刺',
    hudElixir: '圣药',
    keyLmb: '左键',
    keyRmb: '右键',
    keySpace: '空格',
    interactKeyHint: '按 F 交互',
    cindersUnit: '余烬',

    legendCombat: '战斗',
    legendElite: '精英',
    legendWpn: '武器',
    legendTrial: '试炼',
    legendVault: '宝库',
    legendSpring: '圣泉',
    legendPortal: '传送',
    legendBoss: '首领',
    legendStateCur: '当前',
    legendStateVis: '已去',
    legendStateUnvis: '未去',

    boonKickerDefault: '圣所铭印已唤醒',
    boonHeader: '择取一项基础圣印（可无限叠加）',
    boonSub: (roman, rarity) => `第 ${roman} 层 · ${rarity} — 单项小幅加成可无限叠层 · 按 [1-3] 选择 / [R] 重随`,
    boonRerollBtn: (cost, cinders) => `↻ 灵魂重随（消耗 ${cost} 余烬 · 当前 ${cinders}） [R]`,
    boonStackBadge: (cur, next) => cur > 0 ? `已叠 Lv.${cur} → Lv.${next}` : '新缔结 · Lv.1',
    diffLabel: '远征难度',
    lanDiffLabel: '房间难度（房主可调）',

    wpnKicker: '发现神殿兵装',
    wpnKickerBoss: '👑 首领战利品 · 传说神兵现世（二选一祭坛）',
    wpnSubHint: '按数字键 [1 / 2] 替换对应武器槽，或按 [3] 将其分解为灵魂余烬',
    wpnSlotReplace: (slotNum, curName) => `槽位 [${slotNum}] · 当前：${curName}`,
    wpnEquipBtn: (slotNum) => `装备至槽位 ${slotNum}`,
    wpnSalvageTier: '熔解回收 [3]',
    wpnSalvageName: (cinders) => `分解为 +${cinders} 余烬`,
    wpnSalvageDesc: (cinders) => `保留当前双武器配置，将该武器分解为 +${cinders} 灵魂余烬并恢复 +18 生命值。`,
    wpnLeaveBtn: '暂不处理 · 留置神坛 [ESC]',
    wpnCompareCurrent: (curName, curDmg, newDmg) => {
      const delta = newDmg - curDmg;
      const dStr = delta > 0 ? `+${delta}` : `${delta}`;
      return `替换「${curName}」 · 基础伤害 ${curDmg} → ${newDmg}（${dStr}）`;
    },
    wpnStatDmg: '基础伤害',
    wpnStatSpd: '攻击频率',
    wpnStatRange: '有效射程',
    wpnStatCrit: '暴击加成',
    wpnStatShield: '破盾倍率',
    wpnStatImpact: '冲击特性',
    wpnStatSkill: '专属战技',
    wpnStatEnergy: '灵能消耗',
    codexKicker: '五大固有品阶 · 六维核心指标 · 二十神兵名录',
    codexTitle: '神殿兵装全图鉴',
    codexSub: '每把武器拥有固定品阶色彩（凡铁白 / 精良绿 / 稀有蓝 / 史诗紫 / 👑首领传说金）与独立机制；传说级武器仅限击败守关首领掉落。',
    codexCloseBtn: '关闭图鉴 [ESC / B]',
    codexFilterAll: (n) => `全部 (${n})`,
    codexSourceStandard: '神坛 / 试炼掉落',
    codexSourceBoss: '👑 首领讨伐专属',

    endKicker: '圣所远征纪事',
    endVictoryTitle: '永恒余烬已净化',
    endDefeatTitle: '身陨余烬深渊',
    endVictorySub: (w0, w1) => `你携「${w0}」与「${w1}」踏平四层深渊秘境，彻底击碎了永恒余烬君主玛拉科。`,
    endDefeatSub: (roman, biomeName) => `你在第 ${roman} 层（${biomeName}）力竭倒下。重整旗鼓，新的秘境与神兵正在等待。`,
    statDepth: '抵达深度',
    statDepthVal: (roman) => `第 ${roman} / IV 层`,
    statChambers: '探索房间',
    statVanquished: '讨伐强敌',
    statDuration: '远征用时',

    transitionTitle: (roman, biomeName) => `正在深入第 ${roman} 层 · ${biomeName}`,
    bannerMasteryTitle: (roman) => `第 ${roman} 层全图制霸`,
    bannerMasterySub: (cinders) => `已肃清本层全部房间：获得 +${cinders} 余烬，生命上限 +15`,
    bannerTrialStartTitle: '鲜血试炼已解封',
    bannerTrialStartSub: '击败降临的精英卫队，夺取高阶大师神兵',
    bannerTrialWinTitle: '鲜血试炼已征服',
    bannerTrialWinSub: (wpnName, tierLbl) => `「${wpnName}」（${tierLbl}）已现世，靠近按 F 检视`,
    bannerPortalTitle: '深渊传送门已开启',
    bannerPortalSub: (roman, biomeName) => `靠近传送门按 [F] 前往第 ${roman} 层 · ${biomeName}`,
    bannerGuardianSlain: (roman) => `第 ${roman} 层守关首领已讨伐`,
    bannerRoomPurified: (roomTitle) => `${roomTitle} · 敌踪肃清`,
    bannerVaultUnlocked: (roomTitle) => `${roomTitle} · 秘宝开启`,
    bannerBloodPact: '猩红鲜血契约已缔结',
    bannerCinderShrine: '余烬祈愿盆已回应召唤',
    bannerWaveTitle: (cur, total) => `敌潮增援 · 第 ${cur} / ${total} 波`,
    bannerWaveSub: '深渊裂隙涌出新一轮守卫，继续收割！',
    bannerBossGuardsTitle: '首领狂啸 · 禁卫降临',
    bannerBossGuardsSub: '击杀首领召唤的护卫可爆出生命球与额外灵魂余烬！',
    floatShrineEmpty: '本层祈愿次数已用尽',
    floatElixirRefill: '圣药补给 +1',

    floatShieldHit: (dmg) => `⛨ -${dmg}`,
    floatShieldBreak: '破盾眩晕！',
    floatFrenzied: '嗜血狂暴！',
    floatSpikeTrap: '尖刺陷阱',
    floatNeedCinders: (cost) => `余烬不足（需 ${cost}）`,
    floatTempered: (uses) => `淬炼 +${uses}`,
    floatVitalityFull: '生命回满 · 圣药 +1',
    floatSoulCache: (heal) => `+${heal} 生命`,
    floatPact: (costHp, pct) => `-${costHp} 生命 · +${pct}% 伤害`,
    floatEquipped: (name) => `已装备「${name}」`,
    floatCinders: (val) => `+${val} 余烬`,
    floatEnergyGain: (val) => `+${val} 灵能`,
    floatNoEnergy: '灵能不足！',
    floatNoFlasks: '圣药已耗尽',
    floatHpAlreadyFull: '生命已满',
    floatTargetPinned: (name) => `已锁定「${name}」`,
    floatTargetUnpinned: '已切换为自动锁敌',

    pauseKickerSolo: '远征进程已冻结 · 随时调整配置与检视构筑',
    pauseKickerCoop: '局域网联机进行中 · 战场保持实时同步',
    pauseKickerAuto: '检测到切换窗口 · 已为你自动暂停保护',
    pauseTitleSolo: '远征暂停菜单',
    pauseTitleCoop: '联机战术菜单',
    pauseSecBuild: '当前装备与圣物构筑',
    pauseSecSettings: '游戏设置与操作指南',
    pauseSwapOrderBtn: '互换主副槽位 [1↔2]',
    pauseRelicsHeader: (n) => `已缔结圣物 (${n})`,
    pauseRelicsEmpty: '尚未缔结圣物 — 净化房间、开启秘宝或击败首领即可获取。',
    pauseSetVolume: '主音量',
    pauseSetMute: '静音',
    pauseSetUnmute: '开启声音',
    pauseSetQuality: '画面品质',
    pauseOptUltra: '极高',
    pauseOptHigh: '高帧率',
    pauseSetShake: '镜头震动',
    pauseShakeFull: '标准',
    pauseShakeSoft: '柔和',
    pauseShakeOff: '关闭',
    pauseSetDmgNum: '伤害飘字',
    pauseSetAutoPause: '切出窗口自动暂停',
    pauseSetMapMode: '小地图模式',
    pauseMapNormal: '标准',
    pauseMapLarge: '放大 [TAB]',
    pauseMapHidden: '隐藏',
    pauseSetFullscreen: '窗口与全屏',
    pauseOptOn: '开启',
    pauseOptOff: '关闭',
    pauseControlsTitle: '核心键位速查',
    pauseBtnResume: '继续战斗 [ESC]',
    pauseBtnRestart: '重新开始远征',
    pauseBtnRestartHostOnly: '仅房主可重开远征',
    pauseBtnLobby: '离开并回到联机大厅',
    pauseBtnTitle: '返回主界面',
    pauseStatHp: '生命上限',
    pauseStatDmg: '总增伤',
    pauseStatCrit: '暴击 / 暴伤',
    pauseStatSpd: '攻速 / 移速',
    pauseStatWard: '破盾 / 减伤',
    pauseStatEnergy: '灵能 / 获取',
    pauseStatRun: (roman, kills, timeStr) => `第 ${roman} 层 · 讨伐 ${kills} · 用时 ${timeStr}`,
    mapZoomHint: '点击 / TAB 缩放',
    bootStages: [
      '正在唤醒圣殿渲染引擎…',
      '正在锻造深渊材质与纹章…',
      '正在构筑实机秘境与建筑资产…',
      '正在预编译着色器与神兵工坊…',
      '正在校验实机运镜首帧画面…'
    ],
    landingTagline: 'FOUR-FLOOR ACTION ROGUELIKE · 四层随机秘境动作肉鸽',
    landingDesc: '踏入光影交织的沉没圣堂与深渊回廊，在十二位誓约骑士与二十把奇门神兵之间构筑流派，独自或携同伴讨伐永恒余烬。',
    btnEnterSanctum: '进入圣所',
    landingEnterHint: '点击或按 ENTER 键开启',
    landingCamLabel: (biome, room) => `实机秘境运镜 · ${biome} · ${room}`,
    hubKicker: 'SANCTUM EXPEDITION HUB · 圣殿备战中枢',
    hubTitle: '选择远征模式',
    hubSoloTitle: '单人远征',
    hubSoloSub: '挑选誓约骑士 · 深入四层秘境',
    hubCoopTitle: '多人联机',
    hubCoopSub: '1–4 人同网 / 异地网址直连',
    hubCodexTitle: '兵装图鉴',
    hubCodexSub: '20 件神兵建模与机制',
    hubBackCover: '返回封面',
    hubSoloCue: '进入选角 →',
    hubCoopCue: '联机大厅 →',
    hubCodexCue: '检视神兵 →',
    lanSlotPostPick: '开局后统一选角',
    charSoloKicker: 'SOLO OATH SELECTION · 单人远征选角',
    charSoloTitle: '择定出战誓约骑士',
    charCoopKicker: 'PARTY OATH SYNC · 小队同步选角',
    charCoopTitle: '全员择定出战骑士',
    charBackHub: '← 返回模式选择',
    charBackLobby: '← 返回联机大厅',
    charLeaveCoop: '← 离开选角房间',
    charTimerLabel: '选角倒计时',
    charConfirmSolo: '确认出战 · 踏入秘境 →',
    charConfirmCoop: '确认锁定角色',
    charLockedWait: (done, total) => `✓ 已锁定 · 等待队友 (${done}/${total})`,
    charUnlockBtn: '更改选择',
    charPickingTag: '选择中…',
    charLockedTag: '已锁定 ✓',
    charDefaultSuffix: '（默认首位）',
    charBrowsingSuffix: '（浏览中）',
    charRuleSolo: '自由检视十二位誓约骑士建模与天赋，确认后正式踏入第一层秘境',
    charRuleCoop: '全员确认立即开局 · 倒计时结束未确认将自动选用当前浏览角色（未浏览则默认第一位）',
    wpnDragHint: '拖拽旋转 360°',
    wpnReplaceAction: (slotNum) => `替换槽位 ${slotNum}`,
    wpnSalvageAction: '熔解为余烬',
    wpnLeaveShort: '留置神坛 [ESC]'
  },
  en: {
    pageTitle: 'SANCTUM OF ASH — 4-Floor Abyssal Roguelike',
    sysLang: 'LANG: EN',
    sysMapOn: 'MAP [M]',
    sysMapOff: 'MAP: OFF',
    sysGfxUltra: 'GFX: ULTRA',
    sysGfxHigh: 'GFX: HIGH',
    sysAudioOn: 'AUDIO: ON',
    sysAudioOff: 'AUDIO: OFF',
    sysAudioVol: (pct) => `AUDIO: ${pct}%`,
    sysPauseBtn: 'MENU [ESC]',
    sysFullEnter: 'FULLSCREEN',
    sysFullExit: 'WINDOWED',

    titleKicker: '4 FLOORS · 8 BIOMES · 20-WEAPON 5-RARITY ROGUELIKE',
    titleMain: 'SANCTUM OF ASH',
    titleSub: 'Descend through four escalating floors across eight procedural realms. Master 20 wild weapons across 5 color-coded rarities—from Boomerang Chakrams, Prism Lasers, and Clockwork Turrets to Boss-Exclusive Mythic Relics.',
    ctrlMove: 'Explore',
    ctrlSwap: 'Swap Weapon',
    ctrlAttack: 'Attack / Lock-Shot',
    ctrlSkill: 'Weapon Skill',
    ctrlDash: 'Shadow Dash',
    ctrlInteract: 'Interact / Portal',
    ctrlFlask: 'Crimson Elixir',
    ctrlWheel: 'Quick-Swap',
    btnStart: 'DESCEND INTO FLOOR I',
    btnLanLobby: 'LAN CO-OP (1-4P)',
    btnCompendium: 'ARSENAL CODEX [B] · 20',
    btnRetry: 'NEW EXPEDITION',
    btnRetryWaitHost: 'WAITING FOR HOST TO RETRY...',
    btnEndLobby: 'LAN LOBBY',
    btnEndTitle: 'RETURN TO TITLE [ESC]',
    btnTitleLang: 'Language · 中文 / English',

    lanKicker: 'LAN & ONLINE CO-OP · 1-4 PLAYERS',
    lanHeader: 'SANCTUM OF ASH · CO-OP LOBBY',
    lanSub: 'Play with up to 4 knights on the same Wi-Fi or share an Online Invite URL with distant friends. WebRTC P2P direct acceleration, synced seeds & ally revives.',
    lanServerLabel: 'LAN Server WS',
    lanNameLabel: 'Callsign',
    lanColorLabel: 'Crest Color',
    lanCreateBtn: 'CREATE CO-OP ROOM',
    lanJoinPlaceholder: 'ROOM CODE OR INVITE URL',
    lanJoinBtn: 'JOIN ROOM',
    lanRefreshBtn: 'REFRESH',
    lanBackBtn: 'BACK TO TITLE',
    lanActiveRoomsTitle: 'ACTIVE CO-OP ROOMS',
    lanNoRooms: 'No open rooms found — click CREATE CO-OP ROOM to generate LAN & Online Invite URLs',
    lanServerHint: 'Host service ready · Copy the Online Invite URL to let friends anywhere join in one click',
    lanRoomCodeLabel: 'ROOM CODE',
    lanShareUrlLabel: 'LAN INVITE URL',
    lanWanShareUrlLabel: 'ONLINE INVITE URL',
    lanCopyCodeBtn: 'COPY CODE',
    lanCopyUrlBtn: 'COPY LAN URL',
    lanCopyWanUrlBtn: 'COPY ONLINE URL',
    lanEnableWanUrlBtn: 'ENABLE ONLINE URL',
    lanWanGenerating: 'Generating public invite link (~3s)...',
    lanWanIdleHint: 'Click button to generate a public invite URL',
    lanWanRefreshTitle: 'Refresh public invite URL',
    lanCopied: 'COPIED ✓',
    lanReadyBtn: 'READY UP',
    lanUnreadyBtn: 'UNREADY',
    lanLaunchBtn: 'CONFIRM START · HERO SELECT',
    lanWaitHostBtn: 'WAITING FOR HOST TO START...',
    lanWaitReadyBtn: 'WAITING FOR ALL ALLIES TO READY...',
    lanLeaveBtn: 'LEAVE ROOM',
    lanHostTag: 'HOST',
    lanYouTag: 'YOU',
    lanReadyTag: 'READY ✓',
    lanNotReadyTag: 'NOT READY',
    lanEmptySlot: 'Open Slot · Awaiting Ally',
    lanOpenJoinBtn: 'JOIN',
    lanRoomMeta: (cur, max, inGame) => `${cur}/${max}P · ${inGame ? 'IN DUNGEON' : 'IN LOBBY'}`,
    lanScalePreview: (sc) => `[${sc.diffCfg ? sc.diffCfg.enName : 'Standard'}] · ${sc.playerCount}P Co-op · Mob HP ${sc.mobHpMult.toFixed(2)}x · Boss HP ${sc.bossHpMult.toFixed(2)}x · Pack ${Math.round((sc.spawnMult || 1) * 100)}% (+${sc.extraSpawns}) · Cinders ${sc.cinderMult.toFixed(2)}x`,
    soloScalePreview: (sc) => `[${sc.diffCfg ? sc.diffCfg.enName : 'Standard'}] · Solo · Mob HP ${sc.mobHpMult.toFixed(2)}x · Boss HP ${sc.bossHpMult.toFixed(2)}x · Pack ${Math.round((sc.spawnMult || 1) * 100)}% (+${sc.extraSpawns}) · Cinders ${sc.cinderMult.toFixed(2)}x`,
    lanStatusConnected: (ping) => `LAN READY (${ping}ms)`,
    lanStatusConnectedWanReady: (ping) => `LAN & ONLINE READY (${ping}ms)`,
    lanStatusWanClient: (ping) => `ONLINE CONNECTED (${ping}ms)`,
    lanStatusP2PActive: (ping) => `ONLINE P2P DIRECT (${ping}ms)`,
    lanStatusEmbedded: 'LOCAL CO-OP READY',
    lanStatusConnecting: 'Auto-connecting to LAN host...',
    lanStatusReconnecting: 'Reconnecting to your room...',
    lanStatusReconnectingDirect: 'Direct play active · Reconnecting room...',
    lanStatusOffline: 'Offline (Solo Ready)',
    lanErrConnect: 'Could not reach target host—please verify the host game is open or check the invite link',
    lanErrResume: 'Your previous room expired. Rejoin using the host’s latest invite link.',
    lanErrDelivery: 'Some actions could not be delivered. Please check your connection.',
    lanErrNotFound: (code) => `Room "${code}" not found`,
    lanErrFull: (code) => `Room "${code}" is full (4/4)`,

    hudCoopPill: (n, mult) => `⚔ ${n}P · ${mult.toFixed(2)}x`,
    hudCoopTooltipTitle: (n, mult) => `${n}-Player LAN Co-op · ${mult.toFixed(2)}x Scale`,
    hudCoopTooltipBody: (sc) => `Mob HP ${sc.mobHpMult.toFixed(2)}x · Boss HP ${sc.bossHpMult.toFixed(2)}x · Ward ${sc.shieldMult.toFixed(2)}x · Foe DMG ${sc.dmgMult.toFixed(2)}x · +${sc.extraSpawns} Spawns · Cinders ${sc.cinderMult.toFixed(2)}x`,
    partyAlive: 'ACTIVE',
    partyDowned: (sec) => `DOWNED ${Math.ceil(sec)}s`,
    partyReviving: (pct) => `REVIVING ${Math.round(pct * 100)}%`,
    downedBannerTitle: 'MORTALLY WOUNDED · AWAITING REVIVE',
    downedBannerSub: (sec, pct) => pct > 0
      ? `Ally channeling revive (${Math.round(pct * 100)}%) — Hold fast!`
      : `Nearby allies can press [F] to revive you · Bleedout in ${Math.ceil(sec)}s`,
    bannerAllyDownTitle: (name) => `${name} HAS FALLEN!`,
    bannerAllyDownSub: 'Enter their rescue circle and press [F] to revive',
    bannerAllyRevivedTitle: (name) => `${name} REVIVED!`,
    bannerAllyRevivedSub: 'Restored to 50% Vitality with brief Sanctuary Ward',
    floatRevived: 'REVIVED! +50% HP',
    floatDowned: 'DOWNED!',
    floatAllyEquipped: (pName, wName) => `${pName} equipped ${wName}`,
    floatPartyJoin: (pName) => `${pName} joined the party`,
    floatPartyLeave: (pName) => `${pName} left the party`,
    floatRoomRallied: (pName) => `Rallied to ${pName}'s doorway`,
    floatClaimedByAlly: (pName) => `Claimed by ${pName}`,
    floatLootGone: 'Already claimed by an ally',

    hudVitality: 'VITALITY',
    hudFoesRemain: (n) => `${n} FOE${n > 1 ? 'S' : ''}`,
    hudChamberClear: 'CLEAR',
    hudFloorShort: (roman, biomeName) => `FLOOR ${roman}/IV · ${biomeName}`,
    hudMapTitle: (roman) => `FLOOR ${roman}`,
    hudStatsLine: (dmgBonusPct, critPct) => `DMG ${dmgBonusPct >= 0 ? '+' : ''}${dmgBonusPct}% · CRIT ${critPct}%`,
    hudMeleeShort: 'MELEE',
    hudRangedShort: 'LOCK-ON',
    hudPrimaryMelee: 'STRIKE',
    hudPrimaryRanged: 'LOCK-SHOT',
    hudDash: 'DASH',
    hudElixir: 'ELIXIR',
    keyLmb: 'LMB',
    keyRmb: 'RMB',
    keySpace: 'SPC',
    interactKeyHint: 'PRESS F',
    cindersUnit: 'CINDERS',

    legendCombat: 'FIGHT',
    legendElite: 'ELITE',
    legendWpn: 'WPN',
    legendTrial: 'TRIAL',
    legendVault: 'VAULT',
    legendSpring: 'SPRING',
    legendPortal: 'PORTAL',
    legendBoss: 'BOSS',
    legendStateCur: 'HERE',
    legendStateVis: 'VISITED',
    legendStateUnvis: 'UNSEEN',

    boonKickerDefault: 'SANCTUM SIGIL AWAKENED',
    boonHeader: 'CHOOSE A STACKABLE SIGIL',
    boonSub: (roman, rarity) => `Floor ${roman} (${rarity}) — Pure additive stats stack infinitely · [1-3] Pick / [R] Reroll`,
    boonRerollBtn: (cost, cinders) => `↻ Reroll Choices (${cost} Cinders · Have ${cinders}) [R]`,
    boonStackBadge: (cur, next) => cur > 0 ? `Stack Lv.${cur} → Lv.${next}` : 'New · Lv.1',
    diffLabel: 'DIFFICULTY',
    lanDiffLabel: 'Room Difficulty (Host)',

    wpnKicker: 'RELIQUARY ARSENAL DISCOVERED',
    wpnKickerBoss: '👑 BOSS TROPHY · MYTHIC RELIC UNSEALED (CHOOSE 1)',
    wpnSubHint: 'Press [1 / 2] to replace a weapon slot, or [3] to salvage into Soul Cinders',
    wpnSlotReplace: (slotNum, curName) => `SLOT [${slotNum}] · CURRENT: ${curName}`,
    wpnEquipBtn: (slotNum) => `Equip in Slot ${slotNum}`,
    wpnSalvageTier: 'SALVAGE [3]',
    wpnSalvageName: (cinders) => `Salvage (+${cinders} Cinders)`,
    wpnSalvageDesc: (cinders) => `Keep your current weapons and shatter this piece into +${cinders} Soul Cinders and +18 HP.`,
    wpnLeaveBtn: 'Leave on Pedestal · Decide Later [ESC]',
    wpnCompareCurrent: (curName, curDmg, newDmg) => {
      const delta = newDmg - curDmg;
      const dStr = delta > 0 ? `+${delta}` : `${delta}`;
      return `Replaces ${curName} · Base DMG ${curDmg} → ${newDmg} (${dStr})`;
    },
    wpnStatDmg: 'BASE DMG',
    wpnStatSpd: 'ATK RATE',
    wpnStatRange: 'RANGE',
    wpnStatCrit: 'CRIT BONUS',
    wpnStatShield: 'SHIELD MULT',
    wpnStatImpact: 'IMPACT',
    wpnStatSkill: 'SKILL',
    wpnStatEnergy: 'AETHER COST',
    codexKicker: '5 FIXED RARITIES · 6 CORE METRICS · 20 EXOTIC WEAPONS',
    codexTitle: 'SANCTUM ARSENAL COMPENDIUM',
    codexSub: 'Every weapon carries an intrinsic Rarity Color (Common / Uncommon / Rare / Epic / 👑 Boss Mythic) and bespoke combat mechanics. Mythic weapons drop exclusively from Floor Bosses.',
    codexCloseBtn: 'Close Codex [ESC / B]',
    codexFilterAll: (n) => `ALL (${n})`,
    codexSourceStandard: 'Shrine / Trial Pool',
    codexSourceBoss: '👑 BOSS REWARD ONLY',

    endKicker: 'SANCTUM CHRONICLE',
    endVictoryTitle: 'SOVEREIGN OF ASH VANQUISHED',
    endDefeatTitle: 'ASHES CLAIM YOU',
    endVictorySub: (w0, w1) => `You conquered all IV floors of the Abyssal Labyrinth and shattered Sovereign Malakor with ${w0} & ${w1}.`,
    endDefeatSub: (roman, biomeName) => `Fallen on Floor ${roman} (${biomeName}). Rise again—new chambers and weapons await.`,
    statDepth: 'DEPTH REACHED',
    statDepthVal: (roman) => `FLOOR ${roman} / IV`,
    statChambers: 'CHAMBERS',
    statVanquished: 'VANQUISHED',
    statDuration: 'DURATION',

    transitionTitle: (roman, biomeName) => `DESCENDING TO FLOOR ${roman} · ${biomeName}`,
    bannerMasteryTitle: (roman) => `FLOOR ${roman} MASTERY`,
    bannerMasterySub: (cinders) => `All chambers purified: +${cinders} Soul Cinders & +15 Max HP`,
    bannerTrialStartTitle: 'BLOOD TRIAL UNSEALED',
    bannerTrialStartSub: 'Vanquish the Elite Champions to claim a Masterwork Weapon',
    bannerTrialWinTitle: 'BLOOD TRIAL CONQUERED',
    bannerTrialWinSub: (wpnName, tierLbl) => `${wpnName} (${tierLbl}) manifested! Press [F] to inspect`,
    bannerPortalTitle: 'ABYSSAL PORTAL UNSEALED',
    bannerPortalSub: (roman, biomeName) => `Step into the portal [F] to descend to Floor ${roman} · ${biomeName}`,
    bannerGuardianSlain: (roman) => `FLOOR ${roman} GUARDIAN VANQUISHED`,
    bannerRoomPurified: (roomTitle) => `${roomTitle} PURIFIED`,
    bannerVaultUnlocked: (roomTitle) => `${roomTitle} UNLOCKED`,
    bannerBloodPact: 'CRIMSON BLOOD PACT SEALED',
    bannerCinderShrine: 'CINDER SHRINE BLESSING GRANTED',
    bannerWaveTitle: (cur, total) => `REINFORCEMENT WAVE ${cur} / ${total}`,
    bannerWaveSub: 'Fresh abyssal legions surge into the chamber!',
    bannerBossGuardsTitle: 'GUARDIAN ROARS · VANGUARD SUMMONED',
    bannerBossGuardsSub: 'Slay summoned guards for Vitality Orbs & bonus Soul Cinders!',
    floatShrineEmpty: 'SHRINE DEPLETED',
    floatElixirRefill: '+1 ELIXIR',

    floatShieldHit: (dmg) => `⛨ -${dmg}`,
    floatShieldBreak: 'WARD SHATTERED!',
    floatFrenzied: 'FRENZIED!',
    floatSpikeTrap: 'SPIKE TRAP',
    floatNeedCinders: (cost) => `NEED ${cost} CINDERS`,
    floatTempered: (uses) => `TEMPERED +${uses}!`,
    floatVitalityFull: 'VITALITY RESTORED',
    floatSoulCache: (heal) => `+${heal} HP`,
    floatPact: (costHp, pct) => `-${costHp} HP · +${pct}% DMG`,
    floatEquipped: (name) => `EQUIPPED ${name}`,
    floatCinders: (val) => `+${val} CINDERS`,
    floatEnergyGain: (val) => `+${val} AETHER`,
    floatNoEnergy: 'LOW AETHER!',
    floatNoFlasks: 'NO ELIXIRS LEFT',
    floatHpAlreadyFull: 'VITALITY FULL',
    floatTargetPinned: (name) => `LOCKED: ${name}`,
    floatTargetUnpinned: 'AUTO LOCK-ON',

    pauseKickerSolo: 'SIMULATION PAUSED · INSPECT BUILD & SETTINGS',
    pauseKickerCoop: 'LAN CO-OP LIVE · WORLD REMAINS ACTIVE',
    pauseKickerAuto: 'WINDOW UNFOCUSED · AUTO-PAUSED FOR SAFETY',
    pauseTitleSolo: 'EXPEDITION PAUSED',
    pauseTitleCoop: 'TACTICAL MENU',
    pauseSecBuild: 'ARSENAL & RELIC BUILD',
    pauseSecSettings: 'SETTINGS & CONTROLS',
    pauseSwapOrderBtn: 'Swap Slots [1↔2]',
    pauseRelicsHeader: (n) => `BOUND RELICS (${n})`,
    pauseRelicsEmpty: 'No relics bound yet — purify chambers, open vaults, or slay bosses.',
    pauseSetVolume: 'Master Volume',
    pauseSetMute: 'Mute',
    pauseSetUnmute: 'Unmute',
    pauseSetQuality: 'Graphics Quality',
    pauseOptUltra: 'Ultra',
    pauseOptHigh: 'High FPS',
    pauseSetShake: 'Screen Shake',
    pauseShakeFull: 'Full',
    pauseShakeSoft: 'Reduced',
    pauseShakeOff: 'Off',
    pauseSetDmgNum: 'Damage Numbers',
    pauseSetAutoPause: 'Auto-Pause on Tab Switch',
    pauseSetMapMode: 'Minimap Size',
    pauseMapNormal: 'Compact',
    pauseMapLarge: 'Large [TAB]',
    pauseMapHidden: 'Hidden',
    pauseSetFullscreen: 'Display Mode',
    pauseOptOn: 'On',
    pauseOptOff: 'Off',
    pauseControlsTitle: 'KEYBINDS & CONTROLS',
    pauseBtnResume: 'RESUME [ESC]',
    pauseBtnRestart: 'RESTART EXPEDITION',
    pauseBtnRestartHostOnly: 'HOST ONLY RESTART',
    pauseBtnLobby: 'LEAVE TO LAN LOBBY',
    pauseBtnTitle: 'RETURN TO TITLE',
    pauseStatHp: 'Max HP',
    pauseStatDmg: 'Total DMG',
    pauseStatCrit: 'Crit / Mult',
    pauseStatSpd: 'Atk / Move',
    pauseStatWard: 'Ward / DR',
    pauseStatEnergy: 'Aether / Gain',
    pauseStatRun: (roman, kills, timeStr) => `Floor ${roman} · ${kills} Slain · ${timeStr}`,
    mapZoomHint: 'Click / TAB Zoom',
    bootStages: [
      'Initializing Sanctum renderer...',
      'Forging procedural materials & sigils...',
      'Constructing live biome chambers & props...',
      'Pre-compiling shaders & arsenal studio...',
      'Verifying first live cinematic frames...'
    ],
    landingTagline: 'FOUR-FLOOR ABYSSAL ACTION ROGUELIKE',
    landingDesc: 'Descend into atmospheric procedural cathedrals and astral rifts. Pair twelve bespoke classes with twenty exotic weapons—solo or in 1–4P LAN co-op.',
    btnEnterSanctum: 'ENTER SANCTUM',
    landingEnterHint: 'Click or press ENTER',
    landingCamLabel: (biome, room) => `LIVE BIOME SHOWCASE · ${biome} · ${room}`,
    hubKicker: 'SANCTUM EXPEDITION HUB',
    hubTitle: 'Choose Your Path',
    hubSoloTitle: 'Solo Expedition',
    hubSoloSub: 'Select your knight & conquer 4 floors',
    hubCoopTitle: 'Online & LAN Co-op',
    hubCoopSub: '1–4P instant link join',
    hubCodexTitle: 'Arsenal Codex',
    hubCodexSub: '20 3D weapons & traits',
    hubBackCover: 'Cover',
    hubSoloCue: 'Select Hero →',
    hubCoopCue: 'Open Lobby →',
    hubCodexCue: 'View Arsenal →',
    lanSlotPostPick: 'Select hero after start',
    charSoloKicker: 'SOLO OATH SELECTION',
    charSoloTitle: 'Choose Your Knight',
    charCoopKicker: 'PARTY HERO SELECTION',
    charCoopTitle: 'Party Hero Lock-In',
    charBackHub: '← Back to Modes',
    charBackLobby: '← Back to Lobby',
    charLeaveCoop: '← Leave Room',
    charTimerLabel: 'LOCK-IN TIMER',
    charConfirmSolo: 'BEGIN EXPEDITION →',
    charConfirmCoop: 'LOCK IN HERO',
    charLockedWait: (done, total) => `✓ LOCKED · WAITING (${done}/${total})`,
    charUnlockBtn: 'Unlock',
    charPickingTag: 'Browsing...',
    charLockedTag: 'LOCKED ✓',
    charDefaultSuffix: ' (Default #1)',
    charBrowsingSuffix: ' (Browsing)',
    charRuleSolo: 'Inspect all 12 knights and starting loadouts, then confirm to descend into Floor I.',
    charRuleCoop: 'Starts immediately once everyone locks in · Unconfirmed players default to current browsed hero (or #1).',
    wpnDragHint: 'Drag 360°',
    wpnReplaceAction: (slotNum) => `Replace Slot ${slotNum}`,
    wpnSalvageAction: 'Salvage Cinders',
    wpnLeaveShort: 'Leave on Altar [ESC]'
  }
};

export function tUI() {
  return UI_STRINGS[currentLang] || UI_STRINGS.zh;
}

export const ELEMENT_I18N = {
  PYRE:   { zh: '烈焰', en: 'PYRE' },
  FROST:  { zh: '寒霜', en: 'FROST' },
  STORM:  { zh: '雷霆', en: 'STORM' },
  PIERCE: { zh: '穿刺', en: 'PIERCE' },
  VOID:   { zh: '虚空', en: 'VOID' },
  BLOOD:  { zh: '鲜血', en: 'BLOOD' },
  BLIGHT: { zh: '剧毒', en: 'BLIGHT' },
  ASTRAL: { zh: '星界', en: 'ASTRAL' }
};

export const WEAPON_RARITY_I18N = {
  common:   { zh: '凡铁', en: 'COMMON', shortZh: '凡铁', shortEn: 'CMN' },
  uncommon: { zh: '精良', en: 'UNCOMMON', shortZh: '精良', shortEn: 'UNC' },
  rare:     { zh: '稀有', en: 'RARE', shortZh: '稀有', shortEn: 'RARE' },
  epic:     { zh: '史诗', en: 'EPIC', shortZh: '史诗', shortEn: 'EPIC' },
  mythic:   { zh: '👑传说·首领', en: '👑MYTHIC·BOSS', shortZh: '👑传说', shortEn: '👑BOSS' }
};

export const IMPACT_I18N = {
  light:    { zh: '灵巧速击', en: 'Light' },
  medium:   { zh: '均衡冲击', en: 'Medium' },
  heavy:    { zh: '重击硬直', en: 'Heavy' },
  colossal: { zh: '毁灭震击', en: 'Colossal' }
};

export const TIER_I18N = {
  1: { zh: 'MK.I',   en: 'MK.I',   shortZh: 'I',   shortEn: 'I' },
  2: { zh: 'MK.II',  en: 'MK.II',  shortZh: 'II',  shortEn: 'II' },
  3: { zh: 'MK.III', en: 'MK.III', shortZh: 'III', shortEn: 'III' },
  4: { zh: 'MK.IV',  en: 'MK.IV',  shortZh: 'IV',  shortEn: 'IV' }
};

export const WEAPON_I18N = {
  greatsword: {
    zhName: '余烬巨剑',
    enName: 'Sunforged Greatsword',
    zhSkill: '炽焰弧光',
    enSkill: 'SEARING ARC',
    zhSummary: '4.6 米均衡大扇面三连重劈（终结技 360° 旋斩并挥出短程烈焰剑浪点燃前方） · 右键战技：发射贯穿全场的烈焰弯月光刃',
    enSummary: '4.6m broad 3-hit pyre cleave (360° spin + fiery ember wave finisher) · RMB: Piercing Flame Crescent'
  },
  twinblades: {
    zhName: '霜噬双刃',
    enName: 'Frostbite Twinblades',
    zhSkill: '冰华突刺',
    enSkill: 'GLACIAL FLURRY',
    zhSummary: '极速五段双刀连舞（含双刃十字二连剪、4.5 米寒芒突刺与冰莲双段旋斩，挥刀几乎不减速） · 右键：无敌幻影突进并洒出寒冰飞刃',
    enSummary: 'Blistering 5-step dual dance (X-cross double-slash + 4.5m frost thrust + twin lotus spin) · RMB: Invulnerable Frost Lunge'
  },
  warhammer: {
    zhName: '星陨重锤',
    enName: 'Astral Warhammer',
    zhSkill: '雷霆震地',
    enSkill: 'THUNDER SLAM',
    zhSummary: '超重型两段蓄势猛砸：首击宽幅横扫强力击飞，次击双手过顶重砸身前 5.2 米圆形雷霆震地坑 · 右键：连续引爆三道雷霆裂地柱',
    enSummary: 'Heavy 2-step maul: wide battering sweep into a 5.2m overhead thunder-crater slam · RMB: 3x Cascading Lightning Eruption'
  },
  crossbow: {
    zhName: '猎魔连弩',
    enName: 'Sanctum Crossbow',
    zhSkill: '箭雨齐射',
    enSkill: 'ARROW VOLLEY',
    zhSummary: '自动锁定鼠标最近敌人高频速射，每第 4 箭化为破魔金矢（伤害+40%且无限穿透） · 右键：扇形穿透箭雨',
    enSummary: 'Locks nearest foe · Every 4th bolt is a Golden Piercer (+40% DMG) · RMB: 5-Bolt Fan Barrage'
  },
  chakram: {
    zhName: '回旋日轮刃',
    enName: 'Solar Return Chakram',
    zhSkill: '三曜回旋阵',
    enSkill: 'TRIPLE ECLIPSE RING',
    zhSummary: '掷出穿透敌群的旋转飞轮，在极限距离悬停切割后自动折返飞回手中（接轮立减 0.5 秒战技冷却） · 右键：三枚巨型折返日轮',
    enSummary: 'Spinning glaive pierces out, hovers & curves back (catching refunds 0.5s CD) · RMB: 3x Giant Returning Rings'
  },
  plagueflask: {
    zhName: '炼金疫病毒瓶',
    enName: 'Alchemist Blight Censer',
    zhSkill: '禁忌催化剂',
    enSkill: 'CATALYST OUTBREAK',
    zhSummary: '高弧线抛投剧毒烧瓶，碎裂后留下持续 3.6 秒的腐蚀毒沼减速毒伤敌群，毒毙目标还会爆开传染毒雾 · 右键：三连瘟疫母瓶并引爆全场剧毒',
    enSummary: 'Lobs toxic flasks creating 3.6s Acid Pools & contagious Blight · RMB: 3x Flasks + Venom Detonation'
  },
  scattergun: {
    zhName: '碎骨双管霰弹',
    enName: 'Cryptbone Scattergun',
    zhSkill: '爆裂跳弹幕',
    enSkill: 'RICOCHET BUCKSHOT',
    zhSummary: '每次轰出 6 枚骸骨弹丸，贴脸近射伤害额外提升 35% 并强力击退 · 右键战技：轰出 9 枚遇墙镜面反射的合金跳弹',
    enSummary: 'Blasts 6 bone pellets (+35% point-blank DMG & heavy knockback) · RMB: 9 Wall-Bouncing Ricochet Pellets'
  },
  voidstaff: {
    zhName: '虚空星杖',
    enName: 'Voidweaver Staff',
    zhSkill: '虚空奇点',
    enSkill: 'SINGULARITY',
    zhSummary: '发射追踪虚空法球，命中后在周围敌群间智能弹射 2 次 · 右键战技：释放强力聚怪并高频脉冲绞杀的引力黑洞',
    enSummary: 'Homing Void Orbs chain-bounce across 3 foes · RMB: Vortex Singularity pulls & shreds packs'
  },
  chainwhip: {
    zhName: '冥狱锁链鞭',
    enName: 'Abyssal Chain-Whip',
    zhSkill: '锁魂钩拽',
    enSkill: 'SOULSHACKLE HOOK',
    zhSummary: '6.8 米全场最长近战射程：前两段超远直线抽鞭、第三段 210° 狂澜大横扫；鞭梢甜点位命中必定暴击并炸开流血音爆 · 右键：钩拽远敌眩晕',
    enSummary: '6.8m ultra-long whip: twin linear cracks + 210° sweep · Outer-tip sweet-spot ALWAYS CRITS & sonic-bursts · RMB: Harpoon Pull'
  },
  prismbeam: {
    zhName: '极光棱镜射线',
    enName: 'Refulgent Prism Focus',
    zhSkill: '七彩棱镜超载',
    enSkill: 'PRISMATIC OVERDRIVE',
    zhSummary: '零延迟贯穿激光束，按住连射热能聚焦最高提升至 185% 伤害并向旁侧折射次级光束 · 右键：展开 7 道极光棱镜射线横扫',
    enSummary: 'Instant piercing laser ramps up to 185% DMG & refracts a split beam · RMB: 7-Beam Prismatic Overdrive'
  },
  buzzsaw: {
    zhName: '发条撕裂锯盘',
    enName: 'Clockwork Ripper Launcher',
    zhSkill: '护体齿轮锯阵',
    enSkill: 'ORBITAL SAWGUARD',
    zhSummary: '发射高速带齿圆锯，碰到墙壁最多反弹 3 次来回切割敌群 · 右键战技：召唤 3 枚环绕护体高速圆锯持续绞杀 6.5 秒',
    enSummary: 'Serrated sawblades ricochet off walls 3x & inflict Bleed · RMB: Summons 3 Orbiting Sawblades for 6.5s'
  },
  handcannon: {
    zhName: '炼狱攻城火铳',
    enName: 'Brimstone Siege Cannon',
    zhSkill: '龙息霰弹',
    enSkill: 'DRAGONBREATH',
    zhSummary: '轰出大范围高爆灼烧攻城榴弹 · 右键战技：反冲滑步同时倾泻扇形熔岩爆裂榴弹雨',
    enSummary: 'Heavy explosive siege shells ignite packs · RMB: Recoil backstep + Molten Shrapnel Cone'
  },
  bloodscythe: {
    zhName: '猩红收割巨镰',
    enName: 'Crimson Harvester Scythe',
    zhSkill: '血月死神旋舞',
    enSkill: 'REAPER CYCLONE',
    zhSummary: '5.5 米 240° 超广角内钩镰斩（命中微吸聚怪而非推远）接 6 米满月环刈，刀刀吸血并直接处决残血敌群化作追踪血魂 · 右键：鲜血旋风',
    enSummary: '5.5m 240° inward-pulling reaper crescents + 6.0m full-moon harvest · Lifesteals & EXECUTES low-HP foes · RMB: Draining Whirlwind'
  },
  autoturret: {
    zhName: '发条奥术机关匣',
    enName: 'Clockwork Bastion Codex',
    zhSkill: '部署特斯拉炮台',
    enSkill: 'DEPLOY TESLA SENTRY',
    zhSummary: '发射雷电标记脉冲，每第 5 发自动铺设电弧微桩 · 右键战技：在地面部署独立索敌放电的 3D 特斯拉发条炮台（上限 2 座）',
    enSummary: 'Voltaic marker bolts · Every 5th shot drops a Spark Pylon · RMB: Deploys autonomous 3D Tesla Turret (max 2)'
  },
  flyingdaggers: {
    zhName: '太虚御剑匣',
    enName: 'Astral Myriad Sword-Box',
    zhSkill: '万剑归宗',
    enSkill: 'MYRIAD SWORD STORM',
    zhSummary: '每次御使双轨弧线追踪灵剑穿刺目标，叠满 4 层剑印召唤天剑贯顶轰雷 · 右键战技：瞬间唤出 10 把太虚灵剑齐射索敌',
    enSummary: 'Commands twin curved homing spirit swords · 4 Sword Marks call a Sky-Sword strike · RMB: 10 Homing Spirit Blades'
  },
  eclipseblade: {
    zhName: '日蚀次元太刀',
    enName: 'Eclipse Rift-Odachi',
    zhSkill: '次元绝影斩',
    enSkill: 'JUDGMENT OMNISLASH',
    zhSummary: '【首领传说】5.3 米高速四段居合剑术（两连斜切 + 6.8 米一线贯刺 + 广角拔刀断空斩），每击撕裂延迟次元十字斩 · 右键：无敌闪烁五连绝影斩',
    enSummary: '[BOSS MYTHIC] 5.3m swift 4-step iaido (twin cuts + 6.8m rift thrust + wide draw-slash) · Tears Cross-Rifts · RMB: Blink Omnislash'
  },
  starfallbow: {
    zhName: '坠星天穹神弓',
    enName: 'Celestial Starfall Greatbow',
    zhSkill: '群星陨落洗礼',
    enSkill: 'HEAVENFALL CATACLYSM',
    zhSummary: '【首领传说】贯日星矢穿透全场，命中首名敌人即召唤天外陨星砸落并分裂双子追星弹 · 右键：锁定区域降下 7 波陨星雨',
    enSummary: '[BOSS MYTHIC] Piercing star-arrows call a Celestial Meteor & split 2 star-seekers · RMB: 7-Wave Meteor Rain'
  },
  soulgrimoire: {
    zhName: '噬魂死灵圣典',
    enName: 'Necrotic Soul-Eater Tome',
    zhSkill: '百鬼夜行军团',
    enSkill: 'NIGHT PARADE OF WRAITHS',
    zhSummary: '【首领传说】双发噬魂鬼火常驻吸血，战斗中不断唤醒环绕护体的怨灵颅骨（上限 5 颗）自动扑爆强敌 · 右键：百鬼齐射并补满护体怨灵',
    enSummary: '[BOSS MYTHIC] Draining soul-bolts awaken up to 5 Orbiting Wraith Skulls that dive-bomb foes · RMB: 8 Wraiths + Full Skulls'
  },
  mjolnir: {
    zhName: '诸神黄昏雷神戟',
    enName: 'Ragnarok Storm-Halberd',
    zhSkill: '雷神掷戟召回',
    enSkill: 'THUNDERGOD RECALL',
    zhSummary: '【首领传说】三态长柄武艺：首段 6.6 米雷霆贯穿枪刺、二段 5.8 米战斧横扫千军、三段跃劈雷暴裂地坑，招招引落神雷 · 右键：掷戟贯穿全场并召回',
    enSummary: '[BOSS MYTHIC] 3-form polearm arts: 6.6m lightning thrust, 5.8m wide halberd sweep & 5.9m sky-bolt crater slam · RMB: Thrown Recall'
  },
  sunforgecannon: {
    zhName: '赫利俄斯歼星炮',
    enName: 'Helios Singularity Cannon',
    zhSkill: '日冕湮灭主炮',
    enSkill: 'SOLAR ANNIHILATION BEAM',
    zhSummary: '【首领传说】发射缓慢推进的微型恒星，沿途向四周所有敌人持续射出日珥电弧并在终点引发超新星爆炸 · 右键：横贯全场黄金太阳神光炮',
    enSummary: '[BOSS MYTHIC] Fires a Miniature Sun zapping nearby foes before Supernova · RMB: Full-Room Golden Solar Beam'
  }
};

export const WEAPON_AFFIX_I18N = {
  keen:     { zh: '锐利（+5% 暴击）', en: 'Keen (+5% Crit)' },
  swift:    { zh: '迅捷（+7% 攻速）', en: 'Swift (+7% Atk Rate)' },
  brutal:   { zh: '残暴（+10% 伤害）', en: 'Brutal (+10% Damage)' },
  breaker:  { zh: '破障（+30% 破盾）', en: 'Sundering (+30% vs Shield)' },
  leeching: { zh: '渴血（暴击回 2 血）', en: 'Vampiric (+2 HP on Crit)' },
  deadly:   { zh: '绝命（+18% 爆伤）', en: 'Ruthless (+18% Crit DMG)' },
  glacial:  { zh: '霜缚（1.2秒冰缓）', en: 'Frostbound (Chills 1.2s)' },
  searing:  { zh: '炽魂（命中灼烧）', en: 'Pyreforged (Ignites)' },
  voltaic:  { zh: '雷涌（暴击落雷）', en: 'Voltaic (Crit Arc)' },
  agile:    { zh: '轻羽（+5%移速·-8%冷却）', en: 'Featherweight (+5% Spd · -8% CD)' },
  siphoning:{ zh: '汲灵（暴击回 3 灵能）', en: 'Aether-Tapped (+3 Aether on Crit)' }
};

export const RARITY_I18N = {
  1: { zh: '圣所铭印', en: 'SANCTUM SIGIL' },
  2: { zh: '崇高铭印', en: 'EXALTED SIGIL' },
  3: { zh: '神话铭印', en: 'MYTHIC SIGIL' },
  4: { zh: '王权铭印', en: 'SOVEREIGN SIGIL' }
};

export const BOON_I18N = {
  might_sigil: {
    zhName: '锋刃誓言',
    enName: 'Oath of Might',
    zhTier: '强攻圣印',
    enTier: 'MIGHT SIGIL',
    zhDesc: () => '全武器与技能基础伤害 +7%（加法无限叠层）。',
    enDesc: () => '+7% Base All-Weapon & Skill Damage (stacks additively without limit).'
  },
  zephyr_grip: {
    zhName: '疾风手甲',
    enName: 'Gale Gauntlet',
    zhTier: '迅捷圣印',
    enTier: 'HASTE SIGIL',
    zhDesc: () => '近战挥砍与远程射击速度 +5%（加法无限叠层）。',
    enDesc: () => '+5% Melee Swing & Ranged Fire Speed (stacks additively).'
  },
  eagle_eye: {
    zhName: '鹰眼刻印',
    enName: 'Hawkeye Seal',
    zhTier: '精准圣印',
    enTier: 'PRECISION SIGIL',
    zhDesc: () => '暴击率 +4%（超出 100% 的暴击率将等额转化为暴击伤害）。',
    enDesc: () => '+4% Critical Hit Chance (excess above 100% converts into Critical Damage).'
  },
  execution_edge: {
    zhName: '裁决重刃',
    enName: 'Verdict Edge',
    zhTier: '极意圣印',
    enTier: 'LETHALITY SIGIL',
    zhDesc: () => '暴击伤害倍率 +14%（加法无限叠层）。',
    enDesc: () => '+14% Critical Hit Damage Multiplier (stacks additively).'
  },
  vital_vessel: {
    zhName: '不灭生机',
    enName: 'Undying Vitality',
    zhTier: '生机圣印',
    enTier: 'LIFE SIGIL',
    zhDesc: () => '最大生命上限 +22 点，并立即恢复 22 点生命值。',
    enDesc: () => '+22 Max Vitality and immediately restore 22 HP.'
  },
  astral_ward: {
    zhName: '星辉圣障',
    enName: 'Starlight Ward',
    zhTier: '护盾圣印',
    enTier: 'WARD SIGIL',
    zhDesc: () => '最大护盾容量 +18 点（仅脱战后自然充能）。',
    enDesc: () => '+18 Max Shield Capacity (recharges out of combat).'
  },
  aether_capacitor: {
    zhName: '灵能回流',
    enName: 'Aether Reflux',
    zhTier: '充能圣印',
    enTier: 'RECHARGE SIGIL',
    zhDesc: () => '脱战护盾自然恢复速度 +12%，脱战等待时间缩短 0.12 秒。',
    enDesc: () => '+12% Out-of-Combat Shield Regen Rate and -0.12s Delay.'
  },
  iron_hide: {
    zhName: '钢铁肌理',
    enName: 'Iron Bastion',
    zhTier: '坚甲圣印',
    enTier: 'ARMOR SIGIL',
    zhDesc: () => '受到的所有伤害减免 +3.5%（平滑叠层，最高减伤上限 60%）。',
    enDesc: () => '+3.5% Damage Reduction (stacks smoothly up to 60% cap).'
  },
  wind_stride: {
    zhName: '掠影步法',
    enName: 'Phantom Stride',
    zhTier: '灵巧圣印',
    enTier: 'AGILITY SIGIL',
    zhDesc: () => '移动速度 +4.5%（可叠加至最高 +45% 移速）。',
    enDesc: () => '+4.5% Movement Speed (stacks up to +45%).'
  },
  hourglass_rune: {
    zhName: '沙漏铭文',
    enName: 'Chrono Hourglass',
    zhTier: '流转圣印',
    enTier: 'FOCUS SIGIL',
    zhDesc: () => '武器战技与职业绝技的冷却恢复速度加快 +7%。',
    enDesc: () => '+7% Cooldown Recovery Speed for Weapon Skills & Class Ultimate.'
  },
  shadow_spur: {
    zhName: '虚空残步',
    enName: 'Rift Spur',
    zhTier: '残影圣印',
    enTier: 'DASH SIGIL',
    zhDesc: () => '冲刺冷却恢复加快 +7%，且冲刺后 1 秒内移速提升。',
    enDesc: () => '+7% Shadow Dash Cooldown Recovery & brief post-dash speed boost.'
  },
  sunder_crest: {
    zhName: '碎盾重击',
    enName: 'Sundering Crest',
    zhTier: '破城圣印',
    enTier: 'BREAKER SIGIL',
    zhDesc: () => '对敌方护盾造成的破盾伤害 +18%（加法无限叠层）。',
    enDesc: () => '+18% Bonus Damage against Enemy Shields.'
  },
  blood_thirst: {
    zhName: '渴血战意',
    enName: 'Sanguine Thirst',
    zhTier: '嗜血圣印',
    enTier: 'BLOOD SIGIL',
    zhDesc: () => '每次击败敌人恢复 +2 点生命值（怪潮持久战续航利器）。',
    enDesc: () => 'Restore +2 HP whenever you slay an enemy.'
  },
  elixir_craft: {
    zhName: '圣药萃取',
    enName: 'Crimson Distillation',
    zhTier: '炼金圣印',
    enTier: 'ALCHEMY SIGIL',
    zhDesc: () => '饮用圣药额外恢复 +5% 最大生命（每叠满 3 层额外 +1 圣药上限）。',
    enDesc: () => '+5% Max HP restored by Elixirs (every 3 stacks grants +1 Max Elixir).'
  },
  cinder_brand: {
    zhName: '余烬引信',
    enName: 'Ember Fuse',
    zhTier: '烈焰圣印',
    enTier: 'PYRE SIGIL',
    zhDesc: () => '攻击点燃敌人，每秒基础灼烧伤害 +9（随总攻击力同步成长）。',
    enDesc: () => 'Attacks ignite foes for +9 base Burn DPS over 2.5s (scales with Damage).'
  },
  storm_resonator: {
    zhName: '雷弧共鸣',
    enName: 'Arcane Lightning',
    zhTier: '雷霆圣印',
    enTier: 'STORM SIGIL',
    zhDesc: () => '每第 3 次命中弹射连锁闪电，基础雷伤 +16（随总攻击力同步成长）。',
    enDesc: () => 'Every 3rd hit arcs Chain Lightning for +16 base damage (scales with Damage).'
  },
  frost_edge: {
    zhName: '寒霜锋芒',
    enName: 'Rimefrost Edge',
    zhTier: '寒冰圣印',
    enTier: 'FROST SIGIL',
    zhDesc: () => '攻击附带 0.85 秒冰缓，且对减速或冰缓敌人伤害 +5%。',
    enDesc: () => 'Attacks inflict 0.85s Chill and deal +5% bonus damage to slowed/chilled foes.'
  },
  avarice_seal: {
    zhName: '贪婪圣契',
    enName: 'Covenant of Greed',
    zhTier: '黄金圣印',
    enTier: 'WEALTH SIGIL',
    zhDesc: () => '所有途径灵魂余烬获取量 +12%，且选取时立即获得 +20 灵魂余烬。',
    enDesc: () => '+12% Soul Cinder drops from all sources and gain +20 Soul Cinders now.'
  },
  astral_reservoir: {
    zhName: '星穹灵池',
    enName: 'Astral Reservoir',
    zhTier: '灵脉圣印',
    enTier: 'AETHER SIGIL',
    zhDesc: () => '最大灵能上限 +25 点，并立即恢复 25 点灵能（加法无限叠层）。',
    enDesc: () => '+25 Max Aether Capacity and immediately restore 25 Aether (stacks additively).'
  },
  aether_siphon: {
    zhName: '虹吸灵纹',
    enName: 'Aether Siphon',
    zhTier: '汲灵圣印',
    enTier: 'SIPHON SIGIL',
    zhDesc: () => '所有途径灵能获取量 +15%，且每次击败敌人额外回复 +1.5 点灵能。',
    enDesc: () => '+15% Aether gained from all sources and restore +1.5 Aether on enemy kill.'
  },
  arcane_thrift: {
    zhName: '凝练星轨',
    enName: 'Arcane Conduit',
    zhTier: '凝灵圣印',
    enTier: 'CONDUIT SIGIL',
    zhDesc: () => '远程武器射击与战技有 12% 概率不消耗灵能（上限 60%），且远程伤害 +5%。',
    enDesc: () => '+12% chance for Ranged shots & skills to cost 0 Aether (max 60%) and +5% Ranged DMG.'
  }
};

export const BOSS_NAME_I18N = {
  sunken_cathedral:    { zh: '玛拉科先锋 · 淹没圣堂守门人', en: 'MALAKOR VANGUARD, DROWNED GATEKEEPER' },
  withered_roothollow: { zh: '荆棘织母 · 枯木地窟长老',   en: 'THORN-WEAVER ELDER, KEEPER OF BLIGHTWOOD' },
  ossuary_catacomb:    { zh: '莫德伦 · 万骨墓窖大君',     en: 'GRAVELORD MORDREN, ARCHON OF BONES' },
  plague_alchemica:    { zh: '维斯佩拉 · 瘟疫大炼金师',   en: 'VESPERA, GRAND ALCHEMIST OF BLIGHT' },
  ashen_foundry:       { zh: '伊格尼斯 · 地心熔炉巨像',   en: 'IGNIS, THE FURNACE COLOSSUS' },
  crimson_inquisition: { zh: '瓦莱里乌斯 · 猩红大审判官', en: 'HIGH INQUISITOR VALERIUS, SCOURGE OF BLOOD' },
  obsidian_throne:     { zh: '玛拉科 · 永恒余烬君主',     en: 'SOVEREIGN MALAKOR, LORD OF ETERNAL ASH' },
  astral_rift:         { zh: '玛拉科 · 星界蚀日主宰',     en: 'SOVEREIGN MALAKOR, ARCHITECT OF THE ECLIPSE' }
};

export const BIOME_I18N = {
  sunken_cathedral: {
    zhName: '淹没圣堂',
    enName: 'SUNKEN CATHEDRAL',
    zhSub: '雨水漫过青石与黄铜镶边的哥特古殿，幽冷月光穿透残破拱廊',
    enSub: 'Rain-drowned Gothic narthex of wet slate flagstones, bronze inlays & stormlit arches',
    rooms: {
      start:     { zh: ['淹没前庭', '冰冷雨水浸润着沉没大教堂的石阶入口'], en: ['FLOODED NARTHEX', 'Rain-slicked threshold of the sunken cathedral'] },
      combat1:   { zh: ['风雨回廊', '空洞的亡灵哨兵在积水石板间徘徊巡视'], en: ['STORM-WEPT CLOISTER', 'Hollowed sentinels patrol the flooded flagstones'] },
      combat2:   { zh: ['沉水耳堂', '幽暗积水倒映着滴水的哥特尖拱'], en: ['DROWNED TRANSEPT', 'Cold rainwater pools beneath weeping arches'] },
      elite:     { zh: ['余烬中殿', '重甲巨锤兵与尖刺铁栅镇守着内殿封印'], en: ['NAVE OF ASHES', 'Iron juggernauts & spike grates guard the inner seal'] },
      vault:     { zh: ['鎏金秘库', '尘封的圣堂秘宝箱在铁栏后闪烁微光'], en: ['GILDED RELIQUARY', 'An untouched cathedral coffer gleams behind iron bars'] },
      sanctuary: { zh: ['圣杯泉庭', '澄澈圣泉与鲜血祭坛静候勇者抉择'], en: ['CHALICE SPRING', 'Sacred waters & a Crimson Pact await the bold'] },
      boss:      { zh: ['守门人圣殿', '破碎玫瑰花窗之下的至高祭坛'], en: ['SANCTUM OF THE GATEKEEPER', 'High altar beneath the shattered rose window'] }
    }
  },
  withered_roothollow: {
    zhName: '枯根地窟',
    enName: 'WITHERED ROOTHOLLOW',
    zhSub: '石化巨木盘根错节缠绕地底遗迹，荧光孢子在幽绿水潭上漂浮',
    enSub: 'Subterranean ruin strangled by colossal petrified roots, glowing spores & emerald pools',
    rooms: {
      start:     { zh: ['盘根门廊', '古老主根刺穿覆满青苔的潮湿石板'], en: ['SUNKEN ROOT-THRESHOLD', 'Ancient taproots pierce the moss-slicked flagstones'] },
      combat1:   { zh: ['荆棘长廊', '微光孢子弥漫的树洞中潜伏着躁动守卫'], en: ['BRIAR-BOUND GALLERY', 'Spore-lit hollows stir with restless wardens'] },
      combat2:   { zh: ['菌光洞窟', '扭曲树皮下闪烁着幽绿荧光水潭'], en: ['MYCELIAL GROTTO', 'Bioluminescent pools shimmer beneath twisted bark'] },
      elite:     { zh: ['朽木圣枢', '毒刺陷阱与石化古卫封锁着核心树穴'], en: ['HEARTWOOD CROSSING', 'Thorn snares & petrified elders bar the inner hollow'] },
      vault:     { zh: ['琥珀藏室', '远古圣物沉睡在化石树根编织的摇篮中'], en: ['AMBER HOARD', 'Relics slumber within a cradle of fossilized roots'] },
      sanctuary: { zh: ['凝露林间', '生机树液清泉与古木契约并存之地'], en: ['DEWSPRING GLADE', 'Living sap-waters & an Elder Root Pact await'] },
      boss:      { zh: ['枯木王冠殿', '悬垂巨型朽木树心之下的深渊祭场'], en: ['CRADLE OF THE WITHERED TREE', 'Beneath the colossal severed heartwood crown'] }
    }
  },
  ossuary_catacomb: {
    zhName: '白骨墓窖',
    enName: 'BONE OSSUARY',
    zhSub: '嵌满颅骨壁龛与石棺的苍白地下墓穴，森冷冥火静静摇曳',
    enSub: 'Pale bone-inlaid catacombs lined with skull alcoves, coffins & cold soulfire pyres',
    rooms: {
      start:     { zh: ['陵墓前厅', '灰浆石壁上万千沉默颅骨凝视着来者'], en: ['SEPULCHER VESTIBULE', 'Ten thousand silent skulls watch from the mortar'] },
      combat1:   { zh: ['骨髓回廊', '森白冥火在嵌骨石板间幽幽跳动'], en: ['GALLERY OF MARROW', 'Soulfire flickers across bone-paved flagstones'] },
      combat2:   { zh: ['无名地宫', '寒雾笼罩下古老石棺悄然裂开缝隙'], en: ['CRYPT OF THE UNNAMED', 'Sarcophagi crack open beneath cold mist'] },
      elite:     { zh: ['骸骨唱诗堂', '骨刺机关与死灵重卫把守着墓窖主厅'], en: ['CHOIR OF SKULLS', 'Bone-pike grates & deathwardens guard the ossuary nave'] },
      vault:     { zh: ['白骨秘匣室', '先王遗宝在肋骨锻造的圣匣中闪耀'], en: ['IVORY RELIQUARY', 'Ancestral crowns gleam inside a ribcage coffer'] },
      sanctuary: { zh: ['安魂泉井', '苍白灵泉与骨髓血誓静候抉择'], en: ['WELL OF QUIETUS', 'Pale spirit-waters & a Marrow Pact await'] },
      boss:      { zh: ['万骨主教座', '骸骨管风琴簇拥下的死灵王座'], en: ['CATHEDRA OF BONES', 'Monumental skull-throne of the Blight Prelate'] }
    }
  },
  plague_alchemica: {
    zhName: '瘟疫工坊',
    enName: 'PLAGUE ALCHEMICA',
    zhSub: '黑石八角砖与锻铜天鹅颈蒸馏器交织的皇家炼金秘院，暖金炉火映照着青玉灵药',
    enSub: 'Dark slate & burnished copper conservatory of swan-neck alembics, astrolabes & viridian elixirs',
    rooms: {
      start:     { zh: ['皇家药剂前厅', '锻铜曲颈蒸馏器在黑石八角地砖上低鸣'], en: ['ROYAL APOTHECARY ATRIUM', 'Burnished copper alembics hum above octagonal slate'] },
      combat1:   { zh: ['曲颈瓶温室廊', '暖金炉火与青玉药雾交织在天鹅颈冷凝管间'], en: ['RETORT CONSERVATORY', 'Swan-neck condensers gleam in warm gaslight & jade mist'] },
      combat2:   { zh: ['秘药典藏配殿', '黑铁笼护佑的玻璃药坛沿石壁整齐陈列'], en: ['ELIXIR ARCHIVE', 'Caged specimen carboys line the dark wrought-iron gallery'] },
      elite:     { zh: ['星盘大蒸馏枢', '高耸锻铜蒸馏塔与守卫拱卫着秘院中枢'], en: ['ASTROLADE DISTILLERY', 'Pressurized copper towers & wardens guard the inner still'] },
      vault:     { zh: ['贤者秘藏金库', '浑仪铜锁守护着千锤百炼的炼金圣物'], en: ['CHRYSOPOEIA TREASURY', 'Philosopher-forged relics rest within a brass armillary coffer'] },
      sanctuary: { zh: ['万灵澄澈泉', '提纯灵药清泉与炼金嬗变契约并立于此'], en: ['PANACEA WELLSPRING', 'Clarified sovereign draught & a Transmutation Pact await'] },
      boss:      { zh: ['贤者大坩埚殿', '巨型锻铜浑天星盘与秘院反应炉的核心'], en: ['THE PHILOSOPHER\'S CRUCIBLE', 'Grand copper astrolabe & heart of the Royal Alchemica'] }
    }
  },
  ashen_foundry: {
    zhName: '灰烬熔炉',
    enName: 'ASHEN FOUNDRY',
    zhSub: '岩浆裂隙纵横的黑玄武岩地下锻炉，滚烫铁水与火星四处飞溅',
    enSub: 'Cracked basalt forge-halls veined with glowing magma channels, iron buttresses & slag crucibles',
    rooms: {
      start:     { zh: ['熔渣门厅', '焦黑玄武岩板下奔涌着炽热岩浆脉络'], en: ['SLAG-GATE VESTIBULE', 'Molten seams pulse beneath blackened basalt plates'] },
      combat1:   { zh: ['冶炼甬道', '高耸铁柱旁飞溅着坩埚落下的炽热火星'], en: ['SMELTER CONCOURSE', 'Crucible sparks rain beside roaring iron columns'] },
      combat2:   { zh: ['淬火石室', '灼热蒸汽从龟裂的铁水沟渠中升腾'], en: ['QUENCHING CHAMBER', 'Searing steam rises from cracked forge channels'] },
      elite:     { zh: ['泰坦铁砧厅', '炽白尖刺格栅与重甲巨锤兵严阵以待'], en: ['ANVIL OF TITANS', 'White-hot spike grates & armored juggernauts'] },
      vault:     { zh: ['铸锭金库', '大师锻造的传世圣物锁于精钢匣内'], en: ['INGOT BULLION VAULT', 'Masterwork relics locked within forged steel'] },
      sanctuary: { zh: ['淬火圣炉', '余烬圣饮与钢铁血誓为你重燃战意'], en: ['TEMPERED HEARTH', 'Hallowed ember-draught & an Iron Oath await'] },
      boss:      { zh: ['大熔炉之心', '滚烫铁水瀑布倾泻而下的巨像王座'], en: ['HEART OF THE GREAT FURNACE', 'Molten throne of the Furnace Colossus'] }
    }
  },
  crimson_inquisition: {
    zhName: '猩红刑庭',
    enName: 'CRIMSON INQUISITION',
    zhSub: '血色大理石如镜面般倒映着悬挂铁笼、荆棘枷锁与绯红火盆',
    enSub: 'Blood-mirrored red marble tribunal hung with wrought-iron cages, spikes & scarlet pyres',
    rooms: {
      start:     { zh: ['悔罪门廊', '暗红大理石砖上凝聚着如镜的猩红水洼'], en: ['PENITENT VESTIBULE', 'Scarlet mirrors pool across dark marble tiles'] },
      combat1:   { zh: ['铁笼长厅', '悬空的铁链枷锁在绯红火光中轻轻摇晃'], en: ['HALL OF IRON CAGES', 'Suspended shackles sway above crimson flagstones'] },
      combat2:   { zh: ['告解刑道', '审判官的寒刃在暗红幽影中闪烁冷光'], en: ['CONFESSIONAL GAUNTLET', 'Inquisitor blades gleam in the scarlet gloom'] },
      elite:     { zh: ['荆棘审判庭', '断头尖刺与铁甲处决者封锁着去路'], en: ['TRIBUNAL OF THORNS', 'Guillotine grates & ironclad executioners'] },
      vault:     { zh: ['罚没秘宝室', '禁忌圣物被封存在带刺黑铁宝箱之中'], en: ['CONFISCATED RELIQUARY', 'Forbidden artifacts sealed behind spiked iron'] },
      sanctuary: { zh: ['赦罪圣杯庭', '绯红圣泉与殉道血契在此静候'], en: ['CHALICE OF ABSOLUTION', 'Sanguine draught & a Martyrdom Pact await'] },
      boss:      { zh: ['猩红最高刑庭', '巨型铁处女十字拱门下的裁决高台'], en: ['HIGH COURT OF CRIMSON ASH', 'Judgment dais beneath the iron maiden arch'] }
    }
  },
  obsidian_throne: {
    zhName: '黑曜王座',
    enName: 'OBSIDIAN THRONE',
    zhSub: '镜面黑曜石与皇室鎏金交织的宏伟宫阙，深紫幽火映照不朽王权',
    enSub: 'Mirror-polished black obsidian palace inlaid with sovereign gold & imperial violet flame',
    rooms: {
      start:     { zh: ['帝国柱廊', '抛光黑曜石镜面映出璀璨的黄金王徽'], en: ['IMPERIAL PORTICO', 'Polished obsidian mirrors gleam with gilded crests'] },
      combat1:   { zh: ['列王长殿', '皇家金枪与紫焰圣杯夹道拱卫黑晶地面'], en: ['HALL OF SOVEREIGNS', 'Royal lances & violet chalices flank the black glass'] },
      combat2:   { zh: ['王冠秘档馆', '誓约禁卫死守着鎏金封存的古老秘殿'], en: ['CROWN ARCHIVE', 'Oathbound champions guard the gilded vaults'] },
      elite:     { zh: ['禁卫大圣堂', '黑曜枪阵与双词缀恐惧领主拦在王座之前'], en: ['PRAETORIAN GRAND NAVE', 'Obsidian spear-plates & dread lords bar the throne'] },
      vault:     { zh: ['诸王宝库', '君主御用圣物在黑晶阶梯上熠熠生辉'], en: ['TREASURY OF KINGS', 'Sovereign regalia shines atop stepped black glass'] },
      sanctuary: { zh: ['皇室奠酒庭', '神圣甘露与君王血誓助你决战巅峰'], en: ['ROYAL LIBATION COURT', 'Ambrosial font & a Sovereign Blood Oath await'] },
      boss:      { zh: ['永恒余烬王座', '金色日蚀徽记之下，余烬君主静候挑战'], en: ['THRONE OF ETERNAL ASH', 'Seat of Sovereign Malakor beneath the golden sun-crest'] }
    }
  },
  astral_rift: {
    zhName: '星界裂隙',
    enName: 'ASTRAL RIFT',
    zhSub: '刻满发光星轨的破碎天界神庙，悬浮方尖碑与虚空水晶环绕旋转',
    enSub: 'Shattered celestial temple etched with luminous star-conduits, floating monoliths & void crystals',
    rooms: {
      start:     { zh: ['坠星枢纽', '虚空黑石上脉动着璀璨的星图导流槽'], en: ['STARFALL NEXUS', 'Constellation conduits pulse across void-cut stone'] },
      combat1:   { zh: ['星轨回廊', '断离的浮空方尖碑矗立在星界裂隙两侧'], en: ['ORBITAL GALLERY', 'Split monoliths hover beside shimmering star-rifts'] },
      combat2:   { zh: ['蚀日观星台', '奥术棱镜折射出深渊尽头的幽蓝星辉'], en: ['ECLIPSE OBSERVATORY', 'Arcane prisms refract the cold abyssal light'] },
      elite:     { zh: ['视界交汇厅', '虚空晶刺与星界禁卫镇守着时空裂口'], en: ['CONFLUENCE OF HORIZONS', 'Void-crystal spikes & astral wardens guard the rift'] },
      vault:     { zh: ['天界圣物室', '星辰锻造的秘宝悬浮在黄金星环中央'], en: ['CELESTIAL RELIQUARY', 'Star-forged artifacts levitate within golden rings'] },
      sanctuary: { zh: ['星云涌泉', '纯净星辉泉眼与星界盟约在此闪耀'], en: ['NEBULA WELLSPRING', 'Luminous starlight & an Astral Covenant await'] },
      boss:      { zh: ['奇点至高圣所', '时间尽头旋转的多层浑天星盘之下'], en: ['SINGULARITY SANCTUM', 'Beneath the spinning astrolabe at the edge of time'] }
    }
  }
};

export function getBiomeText(biome) {
  if (!biome) return { name: '', sub: '' };
  const entry = BIOME_I18N[biome.id];
  if (!entry) {
    return {
      name: currentLang === 'zh' ? (biome.cnName || biome.name) : biome.name,
      sub: biome.subtitle || ''
    };
  }
  return {
    name: currentLang === 'zh' ? entry.zhName : entry.enName,
    sub: currentLang === 'zh' ? entry.zhSub : entry.enSub
  };
}

export function getRoomText(room) {
  if (!room) return { title: '', subtitle: '' };
  const bEntry = BIOME_I18N[room.biomeId];
  if (bEntry && bEntry.rooms) {
    for (const pair of Object.values(bEntry.rooms)) {
      if (pair.en[0] === room.title || pair.zh[0] === room.title) {
        const arr = currentLang === 'zh' ? pair.zh : pair.en;
        return { title: arr[0], subtitle: arr[1] };
      }
    }
  }
  return { title: room.title || '', subtitle: room.subtitle || '' };
}

export function getBossName(biomeId, fallbackFloorCfg) {
  const b = biomeId && BOSS_NAME_I18N[biomeId];
  if (b) return currentLang === 'zh' ? b.zh : b.en;
  return fallbackFloorCfg ? fallbackFloorCfg.bossName : 'MALAKOR';
}

export function getWeaponText(weaponInst) {
  if (!weaponInst || !weaponInst.def) {
    return { name: '', skill: '', summary: '', rarity: '', tier: '', tierShort: '', elem: '', impact: '', cat: '', catShort: '', affix: '', dmgDisplay: '0' };
  }
  const id = weaponInst.id;
  const w = WEAPON_I18N[id];
  const rarKey = weaponInst.rarity || weaponInst.def.rarity || 'common';
  const rar = WEAPON_RARITY_I18N[rarKey] || WEAPON_RARITY_I18N.common;
  const t = TIER_I18N[weaponInst.tier] || TIER_I18N[1];
  const el = ELEMENT_I18N[weaponInst.def.element] || { zh: weaponInst.def.element, en: weaponInst.def.element };
  const imp = IMPACT_I18N[weaponInst.impactClass || weaponInst.def.impactClass || 'medium'] || IMPACT_I18N.medium;
  const af = weaponInst.affix ? WEAPON_AFFIX_I18N[weaponInst.affix.id] : null;
  const zh = currentLang === 'zh';
  const pellets = weaponInst.pellets || weaponInst.def.pellets || 1;
  const dmgDisplay = pellets > 1 ? `${weaponInst.dmg}×${pellets}` : `${weaponInst.dmg}`;
  return {
    name: w ? (zh ? w.zhName : w.enName) : weaponInst.def.name,
    skill: w ? (zh ? w.zhSkill : w.enSkill) : weaponInst.def.skillName,
    summary: w ? (zh ? w.zhSummary : w.enSummary) : weaponInst.def.summary,
    rarity: zh ? rar.zh : rar.en,
    tier: zh ? `${rar.zh} · ${t.zh}` : `${rar.en} · ${t.en}`,
    tierShort: zh ? `${rar.shortZh} ${t.shortZh}` : `${rar.shortEn} ${t.shortEn}`,
    elem: zh ? el.zh : el.en,
    impact: zh ? imp.zh : imp.en,
    cat: weaponInst.def.category === 'ranged'
      ? (zh ? '远程 · 鼠标最近锁定' : 'Ranged · Cursor Lock')
      : (zh ? '近战 · 范围劈砍' : 'Melee · Cleave'),
    catShort: weaponInst.def.category === 'ranged'
      ? (zh ? '远程锁定' : 'LOCK-ON')
      : (zh ? '近战' : 'MELEE'),
    affix: af ? (zh ? af.zh : af.en) : '',
    dmgDisplay
  };
}

export function getBoonText(boon, scale = 1.0, depth = 1) {
  const entry = BOON_I18N[boon.id];
  const rar = RARITY_I18N[depth] || RARITY_I18N[1];
  const zh = currentLang === 'zh';
  if (!entry) {
    return {
      name: boon.name,
      tier: `${zh ? rar.zh : rar.en} · ${boon.tier}`,
      desc: typeof boon.desc === 'function' ? boon.desc(scale) : boon.desc
    };
  }
  return {
    name: zh ? entry.zhName : entry.enName,
    tier: `${zh ? rar.zh : rar.en} · ${zh ? entry.zhTier : entry.enTier}`,
    desc: zh ? entry.zhDesc(scale) : entry.enDesc(scale)
  };
}

export function getRarityLabel(depth = 1) {
  const rar = RARITY_I18N[depth] || RARITY_I18N[1];
  return currentLang === 'zh' ? rar.zh : rar.en;
}

// Structured high-readability Interactable Prompt Builder!
export function describeInteractable(inter, game) {
  const zh = currentLang === 'zh';
  const h = game.hero;
  const fc = game.floorCfg;
  const inCoop = !!(game.isCoopActive && game.isCoopActive());
  const oneTimePill = inCoop ? [{ text: zh ? '全图唯一 · 先到先得' : 'Unique · First Come', tone: 'cost' }] : [];
  const facilityPill = inCoop ? [{ text: zh ? '个人设施 · 独立使用' : 'Personal Facility', tone: 'stat' }] : [];

  if (!inter) return null;

  if (inter.kind === 'revive_ally') {
    const pct = Math.round((inter.progress || 0) * 100);
    const tName = inter.targetName || 'Ally';
    return {
      badge: zh ? '队友救援' : 'ALLY RESCUE',
      title: pct > 0
        ? (zh ? `正在扶起「${tName}」(${pct}%)` : `Reviving ${tName} (${pct}%)`)
        : (zh ? `按 [F] 扶起「${tName}」` : `Revive ${tName}`),
      accent: '#5effc8',
      pills: [
        { text: zh ? '恢复队友 50% 生命值' : 'Restores 50% Max HP', tone: 'gain' },
        {
          text: pct > 0
            ? (zh ? `救援进度 ${pct}%` : `Progress ${pct}%`)
            : (zh ? `失血剩余 ${Math.ceil(inter.bleedout || 20)}s` : `Bleedout ${Math.ceil(inter.bleedout || 20)}s`),
          tone: pct > 0 ? 'stat' : 'danger'
        }
      ],
      plainLabel: zh ? `[F] 扶起队友 ${tName}` : `[F] REVIVE ${tName.toUpperCase()}`
    };
  }

  if (inter.kind === 'weapon_pedestal') {
    const w = inter.weaponInst;
    const wt = getWeaponText(w);
    const cmpSlot = w.def.category === 'ranged' ? 1 : 0;
    const curW = h.weapons[cmpSlot] || h.weapons[0];
    const newTotal = w.dmg * (w.pellets || w.def.pellets || 1);
    const curTotal = curW ? curW.dmg * (curW.pellets || curW.def?.pellets || 1) : 0;
    const delta = newTotal - curTotal;
    const deltaTxt = delta > 0 ? `+${delta}` : `${delta}`;
    const isBoss = !!(w.bossOnly || w.def?.bossOnly);
    return {
      badge: isBoss ? (zh ? '👑 首领神兵' : '👑 BOSS MYTHIC') : (zh ? '神殿兵装' : 'ARSENAL'),
      title: zh ? `检视「${wt.name}」` : `Inspect ${wt.name}`,
      accent: w.tierColor || w.def.accent,
      pills: [
        { text: `${wt.tier} · ${wt.catShort}`, tone: 'tier' },
        { text: zh ? `伤害 ${wt.dmgDisplay}（${deltaTxt}）` : `DMG ${wt.dmgDisplay} (${deltaTxt})`, tone: delta >= 0 ? 'gain' : 'neutral' },
        ...(wt.affix ? [{ text: wt.affix, tone: 'stat' }] : []),
        ...(inter.bossChoiceGroup ? [{ text: zh ? '首领二选一' : 'Choose 1 of 2', tone: 'cost' }] : []),
        ...oneTimePill
      ],
      plainLabel: zh
        ? `[F] 检视 ${wt.name} (${wt.tier})`
        : `[F] INSPECT ${wt.name.toUpperCase()} (${wt.tier})`
    };
  }

  if (inter.kind === 'forge_anvil') {
    const canAfford = h.cinders >= inter.cost;
    const dmgPct = Math.round(fc.anvilDmgPct * 100);
    const critPct = Math.round(fc.anvilCritBonus * 100);
    const gainStr = zh
      ? `主手升阶淬火 · 全伤害 +${dmgPct}% · 生命 +${fc.anvilHpBonus}${critPct > 0 ? ` · 暴击 +${critPct}%` : ''}`
      : `Temper Active Weapon · +${dmgPct}% DMG · +${fc.anvilHpBonus} HP${critPct > 0 ? ` · +${critPct}% Crit` : ''}`;
    return {
      badge: zh ? '锻造铁砧' : 'FORGE ANVIL',
      title: zh ? '淬炼随身武器' : 'Temper Arsenal',
      accent: canAfford ? '#ffb85c' : '#ff6b7a',
      pills: [
        {
          text: canAfford
            ? (zh ? `消耗 ${inter.cost} 余烬` : `Cost: ${inter.cost} Cinders`)
            : (zh ? `需 ${inter.cost} 余烬（当前 ${h.cinders}）` : `Need ${inter.cost} Cinders (${h.cinders})`),
          tone: canAfford ? 'cost' : 'danger'
        },
        { text: gainStr, tone: 'gain' },
        ...facilityPill
      ],
      plainLabel: zh
        ? `[F] 淬炼武器 (${inter.cost} 余烬)`
        : `[F] TEMPER ARSENAL (${inter.cost} CINDERS)`
    };
  }

  if (inter.kind === 'trial_obelisk') {
    const rewardTier = TIER_I18N[Math.min(4, fc.depth + 1)];
    const tName = zh ? rewardTier.zh : rewardTier.en;
    return {
      badge: zh ? '鲜血试炼碑' : 'BLOOD TRIAL',
      title: zh ? '解封精英围攻试炼' : 'Unseal Elite Trial',
      accent: '#ff4d6d',
      pills: [
        { text: zh ? '挑战：召唤词缀精英卫队' : 'Risk: Elite Ambush', tone: 'danger' },
        { text: zh ? `奖励：必掉 ${tName} 武器 + 余烬` : `Reward: ${tName} Weapon + Cinders`, tone: 'gain' }
      ],
      plainLabel: zh ? '[F] 解封鲜血试炼碑' : '[F] UNSEAL BLOOD TRIAL OBELISK'
    };
  }

  if (inter.kind === 'soul_cache') {
    const cVal = inter.cinderReward || 35;
    return {
      badge: zh ? '遗落魂匣' : 'SOUL CACHE',
      title: zh ? '汲取远古魂匣' : 'Claim Lost Soul Cache',
      accent: '#62ffd6',
      pills: [
        { text: zh ? `+${cVal} 灵魂余烬` : `+${cVal} Soul Cinders`, tone: 'cost' },
        { text: zh ? '恢复 25% 最大生命' : 'Restore 25% Max HP', tone: 'gain' },
        ...oneTimePill
      ],
      plainLabel: zh ? `[F] 汲取遗落魂匣 (+${cVal} 余烬)` : `[F] CLAIM SOUL CACHE (+${cVal} CINDERS)`
    };
  }

  if (inter.kind === 'vault_chest') {
    const rt = getRoomText(inter.room);
    return {
      badge: zh ? '秘宝圣匣' : 'VAULT COFFER',
      title: zh ? `开启「${rt.title}」秘宝箱` : `Open ${rt.title}`,
      accent: '#ffd166',
      pills: [
        { text: zh ? '基础圣印三选一' : 'Choose 1 of 3 Sigils', tone: 'gain' },
        { text: zh ? `+${Math.round(45 * fc.cinderMult)} 灵魂余烬` : `+${Math.round(45 * fc.cinderMult)} Cinders`, tone: 'cost' },
        ...oneTimePill
      ],
      plainLabel: zh ? `[F] 开启 ${rt.title}` : `[F] OPEN ${rt.title}`
    };
  }

  if (inter.kind === 'healing_font') {
    return {
      badge: zh ? '神圣泉眼' : 'SACRED SPRING',
      title: zh ? '饮用圣泉甘露' : 'Drink Sacred Spring',
      accent: '#55ffd2',
      pills: [
        { text: zh ? '回满 100% 生命值' : 'Restore 100% HP', tone: 'gain' },
        { text: zh ? '猩红圣药 +1 瓶' : '+1 Crimson Elixir', tone: 'stat' },
        ...facilityPill
      ],
      plainLabel: zh ? '[F] 饮用神圣泉水' : '[F] DRINK SACRED SPRING'
    };
  }

  if (inter.kind === 'blood_pact') {
    const pactPct = 8;
    return {
      badge: zh ? '鲜血祭坛' : 'BLOOD PACT',
      title: zh ? '缔结猩红血契' : 'Seal Crimson Pact',
      accent: '#ff4d6d',
      pills: [
        { text: zh ? '代价：献祭 30% 当前生命' : 'Cost: -30% Current HP', tone: 'danger' },
        { text: zh ? `圣印三选一 · 基础伤害 +${pactPct}%` : `Sigil Choice + +${pactPct}% DMG`, tone: 'gain' },
        ...facilityPill
      ],
      plainLabel: zh ? '[F] 缔结鲜血契约' : '[F] SEAL BLOOD PACT'
    };
  }

  if (inter.kind === 'cinder_shrine') {
    const rem = Math.max(0, (inter.maxUses || 2) - (inter.uses || 0));
    const canAfford = h.cinders >= inter.cost;
    return {
      badge: zh ? '余烬祈愿盆' : 'CINDER SHRINE',
      title: zh ? `祈求圣印赐福 (${rem}/${inter.maxUses || 2})` : `Invoke Cinder Blessing (${rem}/${inter.maxUses || 2})`,
      accent: canAfford ? '#ffd166' : '#ff6b7a',
      pills: [
        {
          text: canAfford
            ? (zh ? `消耗 ${inter.cost} 余烬` : `Cost: ${inter.cost} Cinders`)
            : (zh ? `需 ${inter.cost} 余烬（当前 ${h.cinders}）` : `Need ${inter.cost} Cinders (${h.cinders})`),
          tone: canAfford ? 'cost' : 'danger'
        },
        { text: zh ? '直接开启 1 次圣印三选一' : 'Grant 1 Stackable Sigil Choice', tone: 'gain' },
        ...facilityPill
      ],
      plainLabel: zh
        ? `[F] 余烬祈愿 (${inter.cost} 余烬)`
        : `[F] CINDER SHRINE (${inter.cost} CINDERS)`
    };
  }

  if (inter.kind === 'descent_portal') {
    const nextIdx = Math.min(3, game.floorIndex + 1);
    const nextCfg = game.floorConfigs ? game.floorConfigs[nextIdx] : null;
    const nextBiome = game.nextFloorBiome;
    const bTxt = nextBiome ? getBiomeText(nextBiome).name : (nextCfg ? nextCfg.name : '');
    const roman = nextCfg ? nextCfg.roman : 'II';
    return {
      badge: zh ? '深渊传送门' : 'ABYSSAL PORTAL',
      title: zh ? `前往第 ${roman} 层 · ${bTxt}` : `Descend to Floor ${roman} · ${bTxt}`,
      accent: '#63dcff',
      pills: [
        { text: zh ? '过层恢复 30% 生命 · 圣药 +2' : 'Heal 30% HP · +2 Elixirs', tone: 'gain' }
      ],
      plainLabel: zh
        ? `[F] 进入深渊传送门 -> 第 ${roman} 层 (${bTxt} / ${nextBiome ? nextBiome.name : ''})`
        : `[F] ENTER ABYSSAL PORTAL -> FLOOR ${roman} (${nextBiome ? nextBiome.name : bTxt})`
    };
  }

  return {
    badge: zh ? '交互' : 'INTERACT',
    title: inter.label || '',
    accent: '#f5d287',
    pills: [],
    plainLabel: inter.label || '[F]'
  };
}
