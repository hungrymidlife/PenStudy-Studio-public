import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const mobile=read('../apps/android/src/Pad.tsx');
const css=read('../apps/android/src/style.css');
const bridge=read('../apps/desktop/src-tauri/src/bridge.rs');
const desktop=read('../apps/desktop/src-tauri/src/lib.rs');

test('wide landscape devices retain a true 16:9 input area and dedicated side space',()=>{
  const landscape=css.split('/* 16:9 drawing viewport inside wider')[1];
  assert.ok(landscape);
  assert.match(landscape,/min\(177\.777778dvh,calc\(100dvw - 104px\)\)/);
  assert.match(landscape,/aspect-ratio:16 \/ 9!important/);
  assert.match(landscape,/grid-template-columns:minmax\(50px,1fr\)/);
  const area=(viewportWidth,viewportHeight)=>{
    const w=Math.min(viewportHeight*16/9,viewportWidth-104);
    return {w,h:w*9/16,side:(viewportWidth-w)/2};
  };
  for(const ratio of [21/9,19.5/9,16/9]){
    const result=area(900*ratio,900);
    assert.ok(Math.abs(result.w/result.h-16/9)<1e-10);
    assert.ok(result.side>=52);
    assert.ok(result.h<=900);
  }
});

test('side toolbar controls never share canvas pointer handlers',()=>{
  const left=mobile.indexOf('className="pad-side-tools pad-side-left"');
  const center=mobile.indexOf('<canvas ref={canvasRef} className="pad"');
  const right=mobile.indexOf('className="pad-side-tools pad-side-right"');
  assert.ok(left>=0&&left<center&&right>center);
  const leftButtons=mobile.slice(left,center);
  const rightButtons=mobile.slice(right,mobile.indexOf('</aside>',right));
  assert.match(leftButtons,/onPointerDown=\{e=>beginRailDrag\('left',e\)\}/);
  assert.match(rightButtons,/onPointerDown=\{e=>beginRailDrag\('right',e\)\}/);
  assert.doesNotMatch(leftButtons,/onPointerDown=\{begin\}/);
  assert.doesNotMatch(rightButtons,/onPointerDown=\{begin\}/);
  assert.match(mobile,/onPointerDown=\{begin\} onPointerMove=\{move\}/);
  assert.match(mobile,/getBoundingClientRect\(\)/);
  assert.match(mobile,/\(e\.clientX-box\.left\)\/box\.width/);
  assert.match(mobile,/\(e\.clientY-box\.top\)\/box\.height/);
});

test('both sidebar strips expose PC overlay controls with icon-only actions',()=>{
  for(const label of ['되돌리기','전체 지우기','화면 저장','펜 색상 선택',
    '펜 얇게','펜 굵게','필압 사용 전환','PC 툴바 선택',
    'PC 툴바 위치 초기화','입력 패드 전체화면 끄기']){
    assert.ok(mobile.includes(label),label);
  }
  assert.match(mobile,/type:'toolbar-focus'/);
  assert.match(mobile,/type:'toolbar-reset'/);
  assert.doesNotMatch(mobile,/type:'overlay-edit-toggle'/);
  assert.match(css,/\.pad-side-tools\{/);
  assert.match(css,/touch-action:manipulation/);
});

test('mobile toolbar commands are authenticated and cannot resize the ink overlay',()=>{
  const auth=bridge.indexOf('if token!=expected_token');
  const focus=bridge.indexOf('if kind=="toolbar-focus"');
  const reset=bridge.indexOf('if kind=="toolbar-reset"');
  assert.ok(auth>=0&&focus>auth&&reset>auth);
  assert.match(desktop,/app\.listen\("toolbar-control-requested"/);
  assert.match(desktop,/fn focus_toolbar\(/);
  assert.match(desktop,/fn reset_toolbar_position\(/);
  assert.doesNotMatch(desktop,/fn set_overlay_editing\(/);
  assert.doesNotMatch(desktop,/fn reset_overlay_bounds\(/);
});
