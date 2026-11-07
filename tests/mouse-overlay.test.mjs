import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=relative=>readFileSync(new URL(relative,import.meta.url),'utf8');
const pad=read('../apps/android/src/Pad.tsx');
const padCss=read('../apps/android/src/style.css');
const toolbar=read('../apps/desktop/src/toolbar.tsx');
const overlay=read('../apps/desktop/src/overlay.tsx');
const bridge=read('../apps/desktop/src-tauri/src/bridge.rs');
const lib=read('../apps/desktop/src-tauri/src/lib.rs');
const mouse=read('../apps/desktop/src-tauri/src/desktop_mouse.rs');
const config=JSON.parse(read('../apps/desktop/src-tauri/tauri.conf.json'));
const capabilities=JSON.parse(read('../apps/desktop/src-tauri/capabilities/default.json'));

test('fullpad exit control becomes an icon-only 32px button',()=>{
  assert.match(pad,/aria-label="입력 패드 전체화면 끄기" title="전체화면 끄기"/);
  assert.match(pad,/<Minimize2 size=\{16\}\/>/);
  assert.match(padCss,/\.fullpad-exit,\.fullpad-mode-toggle\{[^}]*width:32px;height:32px/);
  assert.doesNotMatch(pad,/<Minimize2 size=\{16\}\/>\s*전체화면 끄기/);
});

test('mobile toggles mouse or ink mode and syncs the desktop',()=>{
  assert.match(pad,/useState<'mouse'\|'ink'>\('mouse'\)/);
  assert.match(pad,/type:'input-mode',mode:value/);
  assert.match(pad,/response\.type==='input-mode'/);
  assert.match(pad,/response\.inputMode==='ink'/);
  assert.match(pad,/inputMode==='mouse'/);
  assert.match(pad,/onClick=\{\(\)=>changeInputMode\('mouse'\)\}/);
  assert.match(pad,/onClick=\{\(\)=>changeInputMode\('ink'\)\}/);
  assert.match(bridge,/InputMode \{ Mouse, Ink \}/);
  assert.match(bridge,/pub struct InputModeBus/);
  assert.match(bridge,/let initial_mode=\*mode_rx\.borrow\(\)/);
  assert.match(bridge,/mouse_held/);
});

test('mouse control is accepted only inside authenticated session and releases held button',()=>{
  const authenticationIndex=bridge.indexOf('if token!=expected_token');
  const modeIndex=bridge.indexOf('if kind=="input-mode"');
  const mouseIndex=bridge.indexOf('desktop_mouse::left_button(true)');
  assert.ok(authenticationIndex>0&&modeIndex>authenticationIndex&&mouseIndex>modeIndex);
  assert.match(bridge,/if mouse_held\{let _=desktop_mouse::left_button\(false\);\}/);
  assert.match(mouse,/SetCursorPos/);
  assert.match(mouse,/SendInput/);
  assert.match(mouse,/\(0\.0\.\.=1\.0\)/);
  assert.match(bridge,/stream\.set_nodelay\(true\)/);
});

test('floating toolbar is directly draggable without shrinking the drawing overlay',()=>{
  for(const name of ['get_input_mode','set_input_mode','reset_toolbar_position','focus_toolbar']){
    assert.ok(toolbar.includes(name)||name==='focus_toolbar',name);
    assert.ok(lib.includes(name),name);
  }
  assert.match(toolbar,/getCurrentWindow\(\)\.startDragging\(\)/);
  assert.match(toolbar,/className="toolbar-grip"/);
  assert.match(capabilities.permissions.join(' '),/core:window:allow-start-dragging/);
  assert.ok(config.app.windows.find(w=>w.label==='toolbar'&&w.alwaysOnTop));
  assert.doesNotMatch(overlay,/startResizeDragging\(/);
  assert.doesNotMatch(overlay,/드래그하여 오버레이 이동/);
  assert.doesNotMatch(lib,/fn set_overlay_editing\(/);
  assert.match(lib,/window\.set_ignore_cursor_events\(true\)/);
});

test('full-screen ink overlay captures using its own physical monitor placement',()=>{
  assert.match(lib,/layer_position=overlay_window\.outer_position/);
  assert.match(lib,/layer_size=overlay_window\.inner_size/);
  // E0716 fix: hold the monitor in a local binding and copy its
  // PhysicalPosition before passing values into spawn_blocking ('static).
  assert.match(lib,/let\s+primary_position\s*=\s*\{[\s\S]*?let\s+monitor\s*=\s*app\.primary_monitor\(\)/);
  assert.match(lib,/PhysicalPosition\s*\{\s*x:\s*position\.x\s*,\s*y:\s*position\.y\s*\}/);
  assert.match(lib,/overlay\(&mut picture,&painted,left,top\)/);
  assert.match(lib,/window\.set_position/);
  assert.match(lib,/window\.set_size/);
});
