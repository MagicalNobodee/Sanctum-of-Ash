import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const workDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(workDir, '../outputs');
fs.mkdirSync(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(workDir, 'src/biomes/showcase_entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false
});

const jsCode = result.outputFiles[0].text;
const closeScriptTag = '</scr' + 'ipt>';
const safeJs = jsCode.split(closeScriptTag).join('<\\/scr' + 'ipt>');

const html = [
  '<!DOCTYPE html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="UTF-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '<title>Sanctum of Ash · Modular 8-Biome Procedural Atlas</title>',
  '<style>',
  '  * { box-sizing: border-box; user-select: none; }',
  '  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #05070c; font-family: Cinzel, Georgia, PingFang SC, serif; color: #f2ece1; }',
  '  #showcase-canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }',
  '  .hud-left { position: fixed; top: 18px; left: 18px; width: 336px; background: rgba(8, 11, 18, 0.86); border: 1px solid rgba(216, 172, 94, 0.36); padding: 16px 18px; backdrop-filter: blur(8px); box-shadow: 0 14px 36px rgba(0,0,0,0.65); }',
  '  .kicker { font-size: 10px; letter-spacing: 0.20em; color: #d8ac5e; margin-bottom: 6px; }',
  '  #biome-cn { font-size: 20px; font-weight: 600; color: #fff6e5; margin-bottom: 4px; }',
  '  #biome-en { font-size: 11px; letter-spacing: 0.14em; color: #d8ac5e; margin-bottom: 6px; }',
  '  #seed-meta { font-size: 11px; color: #8ad8b8; margin-bottom: 8px; letter-spacing: 0.08em; }',
  '  #biome-desc { font-size: 12px; line-height: 1.5; color: #b8c0cf; margin-bottom: 12px; }',
  '  .room-box { border-top: 1px solid rgba(216,172,94,0.22); padding-top: 10px; }',
  '  #room-title { font-size: 13px; letter-spacing: 0.14em; color: #f5d287; }',
  '  #room-sub { font-size: 11px; color: #9ea8ba; margin-top: 3px; }',
  '  .jump-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }',
  '  .jump-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(216,172,94,0.32); color: #e8dfd1; font-size: 11px; padding: 5px 8px; cursor: pointer; font-family: inherit; }',
  '  .jump-btn.primary { border-color: #7ee8be; color: #caffea; background: rgba(30, 82, 62, 0.45); }',
  '  .jump-btn:hover { border-color: #f5d287; color: #fff; }',
  '  .hud-bottom { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); display: grid; grid-template-columns: repeat(4, minmax(150px, 195px)); gap: 8px; background: rgba(7, 9, 15, 0.86); border: 1px solid rgba(216, 172, 94, 0.34); padding: 10px; backdrop-filter: blur(8px); }',
  '  .biome-btn { background: rgba(20, 25, 38, 0.85); border: 1px solid rgba(216, 172, 94, 0.24); color: #dfd7c8; padding: 8px 10px; text-align: left; cursor: pointer; font-family: inherit; }',
  '  .biome-btn .b-idx { display: block; font-size: 10px; letter-spacing: 0.12em; color: #9ca6b8; margin-bottom: 2px; }',
  '  .biome-btn strong { font-size: 13px; font-weight: 500; color: #f5efe4; }',
  '  .biome-btn.active { border-color: #f5d287; background: rgba(68, 52, 26, 0.72); box-shadow: 0 0 16px rgba(245, 210, 135, 0.25); }',
  '  .map-panel { position: fixed; top: 18px; right: 18px; width: 196px; background: rgba(8, 11, 18, 0.86); border: 1px solid rgba(216, 172, 94, 0.34); padding: 10px; }',
  '  .map-panel .mp-title { font-size: 10px; letter-spacing: 0.16em; color: #d8ac5e; margin-bottom: 6px; text-align: center; }',
  '</style>',
  '</head>',
  '<body>',
  '  <canvas id="showcase-canvas"></canvas>',
  '  <div class="hud-left">',
  '    <div class="kicker">MODULAR ROOMS & CORRIDORS · 8 BIOMES</div>',
  '    <div id="biome-cn">第一层 · 淹没圣堂</div>',
  '    <div id="biome-en">SUNKEN CATHEDRAL</div>',
  '    <div id="seed-meta">SEED #102401</div>',
  '    <div id="biome-desc"></div>',
  '    <div class="room-box">',
  '      <div id="room-title">FLOODED NARTHEX</div>',
  '      <div id="room-sub"></div>',
  '      <div class="jump-row">',
  '        <button id="btn-reroll" class="jump-btn primary">随机地形 [R]</button>',
  '        <button id="btn-seam" class="jump-btn">连接处特写</button>',
  '        <button class="jump-btn" data-room-jump="start">起点厅</button>',
  '        <button class="jump-btn" data-room-jump="combat">战斗厅</button>',
  '        <button class="jump-btn" data-room-jump="elite">精英厅</button>',
  '        <button class="jump-btn" data-room-jump="vault">宝库厅</button>',
  '        <button class="jump-btn" data-room-jump="sanctuary">圣泉厅</button>',
  '        <button class="jump-btn" data-room-jump="boss">首领殿</button>',
  '      </div>',
  '    </div>',
  '  </div>',
  '  <div class="map-panel">',
  '    <div class="mp-title">RANDOM GRAPH · WASD</div>',
  '    <canvas id="minimap-canvas" width="174" height="168"></canvas>',
  '  </div>',
  '  <div id="biome-buttons" class="hud-bottom"></div>',
  '  <script>' + safeJs + closeScriptTag,
  '</body>',
  '</html>'
].join('\n');

const outPath = path.join(outDir, 'biome-showcase.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Built modular showcase:', outPath, 'Size KB:', (fs.statSync(outPath).size / 1024).toFixed(1));
