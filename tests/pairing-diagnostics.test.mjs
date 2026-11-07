import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const desktop=read('../apps/desktop/src/App.tsx');
const bridge=read('../apps/desktop/src-tauri/src/bridge.rs');
const pad=read('../apps/android/src/Pad.tsx');

test('PC persists Wi-Fi vs USB choice and does not reset it when the bridge is stopped',()=>{
  assert.match(desktop,/LAN_KEY='penstudy\.lanMode\.v1'/);
  assert.match(desktop,/localStorage\.getItem\(LAN_KEY\)==='wifi'/);
  assert.match(desktop,/useState\(initialLanMode\)/);
  assert.match(desktop,/localStorage\.setItem\(LAN_KEY,lan\?'wifi':'usb'\)/);
  assert.match(desktop,/if\(info\.running\)setLan\(info\.lan\)/);
  assert.doesNotMatch(desktop,/setBridge\(info\);setLan\(info\.lan\);/);
});

test('PC displays actual listener address and can refresh the displayed LAN IPv4',()=>{
  assert.match(desktop,/0\.0\.0\.0:39871 \(Wi-Fi\)/);
  assert.match(desktop,/127\.0\.0\.1:39871 \(USB\)/);
  assert.match(desktop,/invoke<string>\('suggest_lan_ip'\)/);
  assert.match(desktop,/refreshLanHost\(\)/);
  assert.match(desktop,/listen<string>\('bridge-connection-detail'/);
});

test('server binds to LAN or loopback and reports connection and authentication state',()=>{
  assert.match(bridge,/let host=if lan \{"0\.0\.0\.0"\} else \{"127\.0\.0\.1"\}/);
  assert.match(bridge,/TcpListener::bind\(\(host,PORT\)\)/);
  assert.match(bridge,/bridge-connection-detail/);
  assert.match(bridge,/if token!=expected_token/);
  assert.match(bridge,/모바일 인증 성공/);
  assert.match(bridge,/모바일 연결이 종료되었습니다/);
});

test('mobile displays URL being contacted and retains actionable error after WebSocket closes',()=>{
  assert.match(pad,/const endpoint=/);
  assert.match(pad,/setNotice\(\x60PC 연결 시도 중:/);
  assert.match(pad,/failureReason/);
  assert.match(pad,/window\.setTimeout\(/);
  assert.match(pad,/9000\)/);
  assert.match(pad,/window\.clearTimeout\(timeout\)/);
  assert.match(pad,/인증 토큰이 맞지 않습니다/);
  assert.match(pad,/Windows 방화벽/);
});
