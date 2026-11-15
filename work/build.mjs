import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const workDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(workDir, '../outputs');
fs.mkdirSync(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(workDir, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false
});

const jsCode = result.outputFiles[0].text;
const tpl = fs.readFileSync(path.join(workDir, 'template.html'), 'utf8');
const html = tpl.replace('/*__BUNDLE_HERE__*/', () => jsCode);

const outPath = path.join(outDir, 'sanctum-of-ash.html');
fs.writeFileSync(outPath, html, 'utf8');
fs.writeFileSync(path.resolve(workDir, '../SanctumOfAsh_3DRoguelike.html'), html, 'utf8');
console.log('Built:', outPath, 'Size KB:', (fs.statSync(outPath).size / 1024).toFixed(1));
