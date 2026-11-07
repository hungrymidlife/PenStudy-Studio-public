import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_PEN_STYLE,orientedPoint,pressureWidth,validStyle} from '../packages/protocol/ink.ts';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const pad=read('../apps/android/src/Pad.tsx');
const overlay=read('../apps/desktop/src/overlay.tsx');
const bridge=read('../apps/desktop/src-tauri/src/bridge.rs');
const lib=read('../apps/desktop/src-tauri/src/lib.rs');
const manifest=read('../scripts/patch-android-manifest.ps1');
const config=JSON.parse(read('../apps/desktop/src-tauri/tauri.conf.json'));

test('phone landscape auto mapping preserves left/right and top/bottom',()=>{
  for(const p of [{x:0,y:0,pressure:.2},{x:1,y:0,pressure:.8},{x:0,y:1,pressure:.5}]){
    assert.deepEqual(orientedPoint(p,'auto'),p);
  }
});
test('manual left/right 90 degree corrections rotate corners instead of stretching canvas',()=>{
  const topLeft={x:0,y:0,pressure:.4};
  assert.deepEqual(orientedPoint(topLeft,'left'),{x:0,y:1,pressure:.4});
  assert.deepEqual(orientedPoint(topLeft,'right'),{x:1,y:0,pressure:.4});
  assert.deepEqual(orientedPoint({x:1,y:1,pressure:.5},'left'),{x:1,y:0,pressure:.5});
});
test('stylus pressure changes stroke width and can be disabled',()=>{
  assert.ok(pressureWidth(6,.02,true,1.4)<pressureWidth(6,.5,true,1.4));
  assert.ok(pressureWidth(6,.5,true,1.4)<pressureWidth(6,1,true,1.4));
  assert.equal(pressureWidth(6,.02,false,1.4),6);
  assert.equal(pressureWidth(6,1,false,1.4),6);
  assert.equal(validStyle(DEFAULT_PEN_STYLE),true);
  assert.equal(validStyle({...DEFAULT_PEN_STYLE,pressureSensitivity:Infinity}),false);
});
test('Android native screen rotation and pointer pressure are wired',()=>{
  assert.match(manifest,/android:screenOrientation="fullSensor"/);
  assert.match(pad,/orientationchange/);
  assert.match(pad,/getCoalescedEvents/);
  assert.match(pad,/pointerType==='pen'/);
  assert.match(pad,/stylusPressure\(e\)/);
  assert.match(pad,/orientedPoint\(base,rotation\)/);
});
test('mobile/desktop share style, and controls are forwarded by authenticated bridge',()=>{
  assert.match(pad,/type:'pen-style',style:next/);
  assert.match(pad,/response\.type==='pen-style'/);
  assert.match(pad,/response\.type==='action'/);
  assert.match(bridge,/pub struct PenStyleBus/);
  assert.match(bridge,/apply_pen_style/);
  assert.match(bridge,/pen-style-changed/);
  assert.match(bridge,/watch::Sender<PenStyle>/);
  assert.match(overlay,/settings\.current\.color/);
  assert.match(overlay,/pressureWidth\(/);
  assert.match(lib,/app\.listen\("settings-updated"/);
});
test('independent always-on-top toolbar is excluded from screenshots',()=>{
  assert.ok(config.app.windows.find(w=>w.label==='toolbar'&&w.alwaysOnTop));
  assert.ok(config.app.windows.find(w=>w.label==='toolbar-right'&&w.alwaysOnTop));
  assert.match(lib,/for label in \["toolbar","toolbar-right"\]/);
  assert.match(lib,/get_webview_window\(label\)/);
  assert.match(lib,/toolbar\.hide\(\)/);
  assert.match(lib,/toolbar\.show\(\)/);
  const toolbar=read('../apps/desktop/src/toolbar.tsx');
  assert.match(toolbar,/set_pen_style/);
  assert.match(toolbar,/request_action/);
});
