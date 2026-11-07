import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const mobile=read('../apps/android/src/Pad.tsx');
const style=read('../apps/android/src/style.css');

test('fullscreen mode starts on after connection and persists toggle',()=>{
  assert.match(mobile,/const\s+isFullPad\s*=\s*connected\s*&&\s*fullPad\s*;/);
  assert.match(mobile,/penstudy\.fullPad\.v1/);
  assert.match(mobile,/localStorage\.setItem\('penstudy\.fullPad\.v1'/);
});
test('fullscreen toggle can be switched on and off without disconnecting',()=>{
  assert.match(mobile,/onClick=\{\(\)=>toggleFullPad\(true\)\}/);
  assert.match(mobile,/onClick=\{\(\)=>toggleFullPad\(false\)\}/);
  assert.match(mobile,/fullpad-exit/);
  assert.match(mobile,/fullpad-toggle/);
  assert.match(mobile,/\{!isFullPad&&<section className="tools">/);
  assert.match(mobile,/\{!isFullPad&&<section className="connect">/);
  assert.match(mobile,/canvasRef\} className="pad" onPointerDown=\{begin\}/);
});
test('16:9 landscape active pad stays centered between independent toolbars',()=>{
  assert.match(style,/\.shell\.full-pad-mode\{[^}]*position:fixed;inset:0/);
  assert.match(style,/\.drawing\.full-pad-drawing\{[^}]*inset:0/);
  const sideLayout=style.split('/* 16:9 drawing viewport inside wider')[1];
  assert.ok(sideLayout,'Dedicated 16:9 layout overrides must exist');
  assert.match(sideLayout,/grid-template-columns:minmax\(50px,1fr\)/);
  assert.match(sideLayout,/aspect-ratio:16 \/ 9!important/);
  assert.match(sideLayout,/aspect-ratio:9 \/ 16!important/);
  assert.match(sideLayout,/\.pad-side-left\{grid-column:1;grid-row:1\}/);
  assert.match(sideLayout,/\.pad-side-right\{grid-column:3;grid-row:1\}/);
  assert.match(mobile,/className="pad-side-tools pad-side-left"/);
  assert.match(mobile,/className="pad-side-tools pad-side-right"/);
  assert.match(style,/touch-action:none/);
});
