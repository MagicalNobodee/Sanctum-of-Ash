"""One browser, two isolated players; no public tunnel or shared server needed."""
import json
import argparse
from pathlib import Path
import subprocess
import tempfile

from playwright.sync_api import sync_playwright
from test_lan_multiplayer import check_system_headroom


ROOT = Path(__file__).resolve().parent.parent


def move_and_check(sender, receiver, delta=0.8):
    target = sender.evaluate("""delta => {
      const g = window.__SANCTUM__;
      g.hero.x += delta;
      return { id: g.lan.clientId, x: g.hero.x };
    }""", delta)
    receiver.wait_for_function("""target => {
      const peer = window.__SANCTUM__.remotePlayers.get(target.id);
      return peer && Math.abs(peer.targetX - target.x) < 0.15;
    }""", arg=target, timeout=5000)


def action_and_check(sender, receiver, marker):
    sender.evaluate("""marker => {
      const g = window.__SANCTUM__;
      g.coopBroadcastPlayerAction({ act: 'melee_swing', duration: 1, step: 0, testId: marker });
    }""", marker)
    receiver.wait_for_function("""marker => window.__networkEvents.filter(p => p.testId === marker).length === 1""",
                               arg=marker, timeout=5000)
    receiver.wait_for_timeout(250)
    assert receiver.evaluate("marker => window.__networkEvents.filter(p => p.testId === marker).length", marker) == 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--require-p2p', action='store_true', help='Fail if this machine cannot establish real direct UDP')
    args = parser.parse_args()
    check_system_headroom(1)
    source = """
      import { createLanServer } from './lan-server.mjs';
      import readline from 'node:readline';
      const lan = createLanServer({ port: 0, host: '127.0.0.1', enableWan: false });
      const { port } = await lan.start();
      console.log(port);
      readline.createInterface({ input: process.stdin }).on('line', line => {
        for (const id of JSON.parse(line)) lan.clients.get(id)?.socket.destroy();
      });
    """
    proc = subprocess.Popen(['node', '--input-type=module', '-e', source], cwd=ROOT,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        port = int(proc.stdout.readline().strip())
        base = f'http://127.0.0.1:{port}'
        with sync_playwright() as p, tempfile.TemporaryDirectory(prefix='sanctum-recovery-') as shots:
            errors = []
            browser = p.chromium.launch(headless=True, args=[
                '--no-proxy-server', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'])
            try:
                pages = []
                for index in range(2):
                    context = browser.new_context(viewport={'width': 900, 'height': 600})
                    context.add_init_script('window.__nativeRtc = window.RTCPeerConnection; window.RTCPeerConnection = undefined;')
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(f'{base}/?gfx=low', wait_until='domcontentloaded')
                    page.wait_for_function('window.__SANCTUM__?.bootComplete === true')
                    pages.append(page)
                host, guest = pages
                host.evaluate('window.__SANCTUM__.coopOpenLobby(false)')
                host.click('#btn-lan-create')
                host.wait_for_function('window.__SANCTUM__.lan.inRoom')
                code = host.evaluate('window.__SANCTUM__.lan.roomCode')
                guest.evaluate('window.__SANCTUM__.coopOpenLobby(false)')
                guest.fill('#lan-code-input', code)
                guest.click('#btn-lan-join')
                guest.wait_for_function('window.__SANCTUM__.lan.inRoom')
                guest.click('#btn-lan-ready')
                host.wait_for_function('!document.getElementById("btn-lan-launch").disabled')
                host.click('#btn-lan-launch')
                for page in pages:
                    page.wait_for_function('window.__SANCTUM__.isCoopCharSelectActive()')
                    page.click('#btn-char-confirm')
                for page in pages:
                    page.wait_for_function('window.__SANCTUM__.mode === "explore" && !!window.__SANCTUM__.dungeon', timeout=20000)
                    page.evaluate("""() => {
                      window.__networkEvents = [];
                      const lan = window.__SANCTUM__.lan;
                      const original = lan.cb.onRelay;
                      lan.cb.onRelay = (from, payload) => { window.__networkEvents.push(payload); original(from, payload); };
                    }""")
                ids = [page.evaluate('window.__SANCTUM__.lan.clientId') for page in pages]
                seeds = [page.evaluate('window.__SANCTUM__.dungeon.seed') for page in pages]
                assert seeds[0] == seeds[1]
                move_and_check(host, guest)
                move_and_check(guest, host)
                action_and_check(guest, host, 'ws-only')
                print('[PASS] No WebRTC: dungeon, movement in both directions and attack delivery')

                proc.stdin.write(json.dumps([ids[1]]) + '\n')
                proc.stdin.flush()
                guest.wait_for_function('window.__SANCTUM__.lan.reconnectingWs')
                guest.evaluate("window.__SANCTUM__.coopBroadcastPlayerAction({ act: 'melee_swing', testId: 'during-reconnect' })")
                guest.wait_for_function('window.__SANCTUM__.lan.connected && !window.__SANCTUM__.lan.reconnectingWs')
                host.wait_for_function('window.__networkEvents.some(p => p.testId === "during-reconnect")')
                assert guest.evaluate('window.__SANCTUM__.lan.clientId') == ids[1]
                assert guest.evaluate('window.__SANCTUM__.mode') == 'explore'
                assert guest.evaluate('window.__SANCTUM__.dungeon.seed') == seeds[1]
                move_and_check(guest, host, -0.8)
                print('[PASS] Socket loss: same identity, room and floor; queued attack and movement recover')

                for page in pages:
                    page.evaluate("""() => {
                      window.RTCPeerConnection = window.__nativeRtc;
                      const lan = window.__SANCTUM__.lan;
                      lan.forceP2P = true;
                    }""")
                for page in pages:
                    page.evaluate('window.__SANCTUM__.lan._syncRtcPeers()')
                direct_available = True
                try:
                    for page in pages:
                        page.wait_for_function('window.__SANCTUM__.lan.p2pPeerCount === 1', timeout=25000)
                except Exception:
                    for page in pages:
                        print('RTC diagnostic:', page.evaluate("""() => [...window.__SANCTUM__.lan._rtcPeers.values()].map(e => ({
                          id: e.peerId, state: e.pc.connectionState, ice: e.pc.iceConnectionState,
                          signaling: e.pc.signalingState, local: e.pc.localDescription?.type,
                          remote: e.pc.remoteDescription?.type, open: e.open, pong: e.lastPongAt
                        }))"""))
                    if args.require_p2p:
                        raise
                    direct_available = False
                    print('[UNVERIFIED] Real P2P unavailable on this network; no claim of direct-path acceptance')
                if direct_available:
                    move_and_check(host, guest, -0.8)
                    action_and_check(guest, host, 'dual-path-once')
                    print('[PASS] Real WebRTC upgrade: movement and deduplicated attack delivery')

                    for page in pages:
                        page.evaluate("""() => {
                          for (const entry of window.__SANCTUM__.lan._rtcPeers.values()) {
                            entry.dc.send = () => {};
                            if (entry.stateDc) entry.stateDc.send = () => {};
                          }
                        }""")
                    for page in pages:
                        page.wait_for_function('window.__SANCTUM__.lan.p2pPeerCount === 0', timeout=10000)
                    move_and_check(host, guest)
                    move_and_check(guest, host)
                    action_and_check(host, guest, 'blackhole-fallback')
                    for page in pages:
                        page.wait_for_function('window.__SANCTUM__.lan.p2pPeerCount === 1', timeout=20000)
                    print('[PASS] Silent P2P failure: automatic WS fallback, then automatic direct reconnection')

                proc.stdin.write(json.dumps(ids) + '\n')
                proc.stdin.flush()
                for page in pages:
                    page.wait_for_function('window.__SANCTUM__.lan.reconnectingWs')
                for page in pages:
                    page.wait_for_function('window.__SANCTUM__.lan.connected && !window.__SANCTUM__.lan.reconnectingWs')
                move_and_check(guest, host, -0.8)
                for index, page in enumerate(pages):
                    assert page.evaluate('window.__SANCTUM__.lan.clientId') == ids[index]
                    page.screenshot(path=f'{shots}/player-{index}.png')
                assert not errors, errors
                print(f'[PASS] WS recovery completed with no page errors; real P2P verified: {direct_available}')
            finally:
                browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=4)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()


if __name__ == '__main__':
    main()
