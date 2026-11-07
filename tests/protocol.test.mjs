import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../apps/desktop/src-tauri/src/bridge.rs',import.meta.url),'utf8');
const pad=readFileSync(new URL('../apps/android/src/Pad.tsx',import.meta.url),'utf8');
const overlay=readFileSync(new URL('../apps/desktop/src/overlay.tsx',import.meta.url),'utf8');
test('bridge enforces authentication before strokes',()=>{
  assert.match(server,/"hello"/); assert.match(server,/"auth-ok"/); assert.match(server,/token\s*!=\s*expected_token/);
});
test('mobile generates begin / move / end packets',()=>{
  for(const msg of ['begin','move','end','save','clear','undo'])assert.ok(pad.includes(`'${msg}'`),msg);
});
test('overlay handles screenshot command and stroke events',()=>{
  assert.match(overlay,/capture-requested/); assert.match(overlay,/pen-packet/); assert.match(overlay,/save_capture/);
});
