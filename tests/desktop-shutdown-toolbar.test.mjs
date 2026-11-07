import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const lib=read('../apps/desktop/src-tauri/src/lib.rs');
const bridge=read('../apps/desktop/src-tauri/src/bridge.rs');
const overlay=read('../apps/desktop/src/overlay.tsx');
const toolbar=read('../apps/desktop/src/toolbar.tsx');
const phone=read('../apps/android/src/Pad.tsx');

test('closing main window exits all floating windows and shuts down the WebSocket listener',()=>{
  assert.match(lib,/\.on_window_event\(\|window,event\|/);
  assert.match(lib,/window\.label\(\)=="main"/);
  assert.match(lib,/WindowEvent::CloseRequested/);
  assert.match(lib,/bridge::stop_bridge_on_exit\(app\)/);
  assert.match(lib,/app\.exit\(0\)/);
  assert.match(bridge,/pub fn stop_bridge_on_exit\(app:&AppHandle\)/);
  assert.match(bridge,/server\.shutdown\.send\(true\)/);
  assert.match(bridge,/server\.task\.abort\(\)/);
  assert.match(bridge,/desktop_mouse::left_button\(false\)/);
});
test('server stop waits until TCP listener exits before allowing a restart',()=>{
  assert.match(bridge,/pub async fn stop_bridge\(/);
  assert.match(bridge,/tokio::time::timeout\(Duration::from_secs\(2\),&mut server\.task\)/);
  assert.match(bridge,/let task=tokio::spawn/);
  assert.match(bridge,/BridgeServer\{shutdown,task,info:info\.clone\(\)\}/);
  assert.match(bridge,/std::io::ErrorKind::AddrInUse/);
});
test('toolbar grip moves only the toolbar, not the full-screen transparent overlay',()=>{
  assert.match(toolbar,/onPointerDown=\{beginToolbarDrag\}/);
  assert.match(toolbar,/getCurrentWindow\(\)\.startDragging\(\)/);
  assert.match(toolbar,/invoke\('reset_toolbar_position',\{side\}\)/);
  assert.match(lib,/fn reset_toolbar_position\(/);
  assert.match(lib,/fn focus_toolbar\(/);
  assert.match(lib,/window\.set_ignore_cursor_events\(true\)/);
  assert.doesNotMatch(lib,/fn set_overlay_editing\(/);
  assert.doesNotMatch(overlay,/드래그하여 오버레이 이동/);
  assert.doesNotMatch(overlay,/startResizeDragging/);
});
test('mobile tools focus or restore floating toolbar with authenticated packets only',()=>{
  assert.match(phone,/type:'toolbar-focus'/);
  assert.match(phone,/type:'toolbar-reset'/);
  assert.match(bridge,/if kind=="toolbar-focus"/);
  assert.match(bridge,/if kind=="toolbar-reset"/);
  assert.match(lib,/app\.listen\("toolbar-control-requested"/);
  assert.match(lib,/focus_toolbar\(toolbar_handle\.clone\(\),Some\(side\.into\(\)\)\)/);
  assert.match(lib,/reset_toolbar_position\(toolbar_handle\.clone\(\),Some\(side\.into\(\)\)\)/);
  assert.doesNotMatch(phone,/type:'overlay-edit-toggle'/);
});
