import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalHex,hexToHsv,hsvToHex} from '../apps/desktop/src/colorMath.ts';

test('HEX picker normalizes 3/6 digit colors and rejects malformed input',()=>{
  assert.equal(canonicalHex('#abc'),'#AABBCC');
  assert.equal(canonicalHex('0a72FF'),'#0A72FF');
  assert.equal(canonicalHex('#xyz'),null);
  assert.equal(canonicalHex('#12345'),null);
});
test('HSV color selection keeps primary colors, white, black and greys',()=>{
  for(const c of ['#FF0000','#00FF00','#0000FF','#FFFFFF','#000000','#777777','#AABBCC','#1A293D']){
    const hsv=hexToHsv(c);
    assert.equal(hsvToHex(hsv.h,hsv.s,hsv.v),c);
  }
});
test('hue slider generates all rainbow primary colors',()=>{
  assert.equal(hsvToHex(0,1,1),'#FF0000');
  assert.equal(hsvToHex(120,1,1),'#00FF00');
  assert.equal(hsvToHex(240,1,1),'#0000FF');
});
test('settings contain separate sidebar pages, theme persistence and touch color control',()=>{
  const app=readFileSync(new URL('../apps/desktop/src/App.tsx',import.meta.url),'utf8');
  const picker=readFileSync(new URL('../apps/desktop/src/ColorPicker.tsx',import.meta.url),'utf8');
  const style=readFileSync(new URL('../apps/desktop/src/style.css',import.meta.url),'utf8');
  for(const page of ["'home'","'connection'","'ink'","'save'","'appearance'","'help'"])assert.ok(app.includes(page),'Missing route '+page);
  assert.match(app,/localStorage\.setItem\(THEME_KEY,theme\)/);
  assert.match(app,/settings-updated/);
  assert.match(picker,/onPointerDown=\{begin\}/);
  assert.match(style,/touch-action:none/);
  assert.match(picker,/savedColors\.v1/);
  assert.match(style,/--bg:#080808/);
  assert.match(style,/--bg:#f6f7f9/);
});
