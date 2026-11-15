import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { browserCommand } from '../lan-server.mjs';

test('browser commands keep URLs as one argument without a command shell', () => {
  const url = 'http://127.0.0.1:18765/?room=ABCD&name=玩家';
  assert.deepEqual(browserCommand(url, 'darwin'), ['open', [url]]);
  assert.deepEqual(browserCommand(url, 'win32'), ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]);
  assert.deepEqual(browserCommand(url, 'linux'), ['xdg-open', [url]]);
});

test('native double-click launcher preserves paths, arguments and working directory', {
  skip: !['darwin', 'win32'].includes(process.platform), timeout: 15000,
}, async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'Sanctum 玩家 & launcher '));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temp, 'outputs'));
  const name = process.platform === 'win32' ? 'Start-Sanctum.cmd' : 'Start-Sanctum.command';
  const launcher = path.join(temp, 'outputs', name);
  fs.copyFileSync(new URL(`../outputs/${name}`, import.meta.url), launcher);
  const result = path.join(temp, 'result.json');
  fs.writeFileSync(path.join(temp, 'lan-server.mjs'), `
    import fs from 'node:fs';
    fs.writeFileSync(process.env.SANCTUM_LAUNCHER_RESULT, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));
  `);
  const windows = process.platform === 'win32';
  const child = spawn(windows ? (process.env.ComSpec || 'cmd.exe') : '/bin/bash',
    windows ? ['/d', '/s', '/c', `""${launcher}" --no-wan"`] : [launcher, '--no-wan'], {
      cwd: os.tmpdir(), windowsVerbatimArguments: windows,
      env: { ...process.env, SANCTUM_LAUNCHER_RESULT: result }, stdio: 'pipe',
    });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  child.stdin.end();
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(code, 0, output);
  const actual = JSON.parse(fs.readFileSync(result, 'utf8'));
  assert.equal(fs.realpathSync(actual.cwd), fs.realpathSync(temp));
  assert.deepEqual(actual.args, ['--open', '--no-wan']);
});

test('real CLI starts from a Unicode/space path and unrelated working directory', { timeout: 20000 }, async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'Sanctum 玩家 & game '));
  const root = fileURLToPath(new URL('../', import.meta.url));
  // Copy only runtime files: players need neither npm nor the development tree.
  fs.copyFileSync(path.join(root, 'lan-server.mjs'), path.join(temp, 'lan-server.mjs'));
  fs.mkdirSync(path.join(temp, 'outputs'));
  fs.copyFileSync(path.join(root, 'outputs/sanctum-of-ash.html'), path.join(temp, 'outputs/sanctum-of-ash.html'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [path.join(temp, 'lan-server.mjs'), '--port', String(port), '--no-wan'], {
    cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: '' },
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise(resolve => child.once('close', resolve));
      child.kill();
      await closed;
    }
    fs.rmSync(temp, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${output}`)), 10000);
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Exited: ${code}: ${output}`)); });
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes(`Listening on port ${port}`)) { clearTimeout(timer); resolve(); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const info = await (await fetch(`${base}/api/lan-info`)).json();
  assert.equal(info.app, 'sanctum-of-ash-lan');
  assert.equal(info.port, port);
  const game = await fetch(`${base}/?room=ABCD`);
  assert.equal(game.status, 200);
  assert.equal(await game.text(), fs.readFileSync(path.join(temp, 'outputs/sanctum-of-ash.html'), 'utf8'));
  assert.equal((await fetch(`${base}/missing-file.png`)).status, 404);
});
