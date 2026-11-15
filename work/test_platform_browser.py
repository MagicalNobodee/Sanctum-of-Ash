"""Serial offline + two-context multiplayer smoke test on native desktop hosts."""
import json
import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
from platform_test_support import chromium_args

ROOT = Path(__file__).resolve().parents[1]


def main():
    with socket.socket() as reserve:
        reserve.bind(('127.0.0.1', 0))
        port = reserve.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    server = subprocess.Popen(['node', str(ROOT / 'lan-server.mjs'), '--port', str(port), '--no-wan'],
                              cwd=ROOT.parent, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if server.poll() is not None:
                raise RuntimeError('Test LAN server exited')
            try:
                with urllib.request.urlopen(base + '/api/lan-info', timeout=1) as response:
                    assert json.load(response)['app'] == 'sanctum-of-ash-lan'
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError('Test LAN server did not become ready')

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=chromium_args())
            errors = []
            try:
                def page_at(url):
                    context = browser.new_context(viewport={'width': 960, 'height': 600},
                                                  device_scale_factor=0.35 if os.environ.get('CI') else 1)
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(url, wait_until='load')
                    if os.environ.get('CI'):
                        page.wait_for_function('() => window.__SANCTUM__?.moonLight', timeout=60000)
                        # Software-only runners have no GPU; keep real shadows at a smaller resolution.
                        page.evaluate('() => window.__SANCTUM__.moonLight.shadow.mapSize.set(128, 128)')
                    page.wait_for_function('() => window.__SANCTUM__?.bootComplete', timeout=60000)
                    return context, page

                solo_context, solo = page_at((ROOT / 'outputs/sanctum-of-ash.html').as_uri() + '?gfx=high')
                solo.click('#btn-enter-sanctum')
                solo.click('#btn-start')
                solo.click('#btn-char-confirm')
                solo.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=30000)
                assert solo.evaluate('() => window.__SANCTUM__.renderer.getContext().getParameter(WebGL2RenderingContext.VERSION)')
                solo_context.close()
                print('PASS: offline file, WebGL scene, character selection and solo start')

                _, host = page_at(base + '/?gfx=high&charTimer=3')
                host.click('#btn-enter-sanctum')
                host.click('#btn-lan-lobby')
                host.click('#btn-lan-create')
                host.wait_for_function('() => !!window.__SANCTUM__.lan.roomCode')
                code = host.evaluate('() => window.__SANCTUM__.lan.roomCode')
                _, guest = page_at(base + f'/?room={code}&gfx=high&charTimer=3')
                guest.click('#btn-lan-join')
                guest.wait_for_function('() => window.__SANCTUM__.lan.inRoom')
                guest.click('#btn-lan-ready')
                host.wait_for_function('() => !document.getElementById("btn-lan-launch").disabled')
                host.click('#btn-lan-launch')
                for page in (host, guest):
                    page.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=30000)
                seed = host.evaluate('() => window.__SANCTUM__.currentFloorSeed')
                assert isinstance(seed, (int, float)), 'Missing authoritative map seed'
                assert seed == guest.evaluate('() => window.__SANCTUM__.currentFloorSeed')
                peer_id = guest.evaluate('() => window.__SANCTUM__.lan.clientId')
                before = guest.evaluate('() => ({x: window.__SANCTUM__.hero.x, z: window.__SANCTUM__.hero.z})')
                guest.keyboard.down('d')
                guest.wait_for_function('''before => {
                    const hero = window.__SANCTUM__.hero;
                    return Math.hypot(hero.x - before.x, hero.z - before.z) > 1.2;
                }''', arg=before, timeout=15000)
                guest.keyboard.up('d')
                pos = guest.evaluate('() => ({x: window.__SANCTUM__.hero.x, z: window.__SANCTUM__.hero.z})')
                host.wait_for_function('''({id, pos}) => {
                    const peer = window.__SANCTUM__.remotePlayers.get(id);
                    return peer && Math.hypot(peer.x - pos.x, peer.z - pos.z) < 0.5;
                }''', arg={'id': peer_id, 'pos': pos}, timeout=15000)
                assert not errors, errors
                print('PASS: two players joined, selected characters, loaded same map and synced movement; no page errors')
            finally:
                browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == '__main__':
    main()
