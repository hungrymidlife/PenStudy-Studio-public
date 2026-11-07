import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LayerInkHistory} from '../packages/protocol/layerHistory.ts';
import {DEFAULT_PEN_STYLE,ERASER_MIN_WIDTH,ERASER_MAX_WIDTH,validStyle}
  from '../packages/protocol/ink.ts';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const desktop=read('../apps/desktop/src/overlay.tsx');
const preview=read('../apps/android/src/layerPreview.ts');
const pad=read('../apps/android/src/Pad.tsx');
const bridge=read('../apps/desktop/src-tauri/src/bridge.rs');
const rust=read('../apps/desktop/src-tauri/src/lib.rs');
const toolbar=read('../apps/desktop/src/toolbar.tsx');
const cfg=JSON.parse(read('../apps/desktop/src-tauri/tauri.conf.json'));
const capabilities=JSON.parse(read('../apps/desktop/src-tauri/capabilities/default.json'));

const stroke=(layerId,name,tool='pen')=>({layerId,name,tool});

test('clear current Photoshop layer never deletes ink or erasers on other layers',()=>{
  const history=new LayerInkHistory();
  const a=stroke('A','A pencil'), b=stroke('B','B drawing'),
    ae=stroke('A','A eraser','eraser'),be=stroke('B','B eraser','eraser');
  for(const ink of [a,b,ae,be])history.add(ink);
  assert.equal(history.clear('A'),2);
  assert.deepEqual(history.strokes,[b,be]);
  assert.equal(history.undo('A'),true);
  assert.deepEqual(history.strokes,[a,b,ae,be]);
  // Undo A's eraser must not touch later B's eraser or B's drawing.
  assert.equal(history.undo('A'),true);
  assert.deepEqual(history.strokes,[a,b,be]);
});

test('last action on selected layer can be undone with newer strokes on other layers',()=>{
  const history=new LayerInkHistory();
  const a=stroke('A','A1'),b=stroke('B','B1'),c=stroke('A','A2');
  history.add(a);history.add(b);history.add(c);
  history.undo('B');
  assert.deepEqual(history.strokes,[a,c]);
  history.undo('A');
  assert.deepEqual(history.strokes,[a]);
  history.undo('A');
  assert.deepEqual(history.strokes,[]);
  assert.equal(history.undo('B'),false);
});

test('normal mode full clear remains global and can be undone',()=>{
  const history=new LayerInkHistory();
  const a=stroke('base','A'),b=stroke('other','B');
  history.add(a);history.add(b);
  assert.equal(history.clear(null),2);
  assert.deepEqual(history.strokes,[]);
  assert.equal(history.undo(null),true);
  assert.deepEqual(history.strokes,[a,b]);
});

test('deleted layer data cannot return through a later undo',()=>{
  const history=new LayerInkHistory();
  history.add(stroke('A','first'));
  history.add(stroke('B','second'));
  history.clear('A');
  history.dropLayer('A');
  assert.equal(history.undo('A'),false);
  assert.deepEqual(history.strokes,[stroke('B','second')]);
});

test('eraser size is independent of pen width and accepts 512px',()=>{
  assert.equal(DEFAULT_PEN_STYLE.eraserWidth,64);
  assert.equal(ERASER_MIN_WIDTH,4);
  assert.equal(ERASER_MAX_WIDTH,512);
  assert.ok(validStyle({...DEFAULT_PEN_STYLE,eraserWidth:512}));
  assert.ok(validStyle({...DEFAULT_PEN_STYLE,eraserWidth:4}));
  assert.equal(validStyle({...DEFAULT_PEN_STYLE,eraserWidth:513}),false);
  assert.equal(validStyle({...DEFAULT_PEN_STYLE,eraserWidth:3}),false);
  assert.match(bridge,/eraser_width:f64/);
  assert.match(bridge,/\(4\.0\.\.=512\.0\)/);
  assert.match(desktop,/width:tool==='eraser'\?style\.eraserWidth:style\.width/);
  assert.match(preview,/stroke\.style\.eraserWidth/);
});

test('ink and eraser compositing always target their own raster layer',()=>{
  assert.match(desktop,/history\.current\.add\(stroke\)/);
  assert.match(desktop,/history\.current\.clear\(currentLayerScope\(\)\)/);
  assert.match(desktop,/history\.current\.undo\(currentLayerScope\(\)\)/);
  assert.match(desktop,/layerSurface\(stroke\.layerId\)/);
  assert.match(desktop,/stroke\.tool==='eraser'\?'destination-out':'source-over'/);
  assert.match(preview,/this\.surface\(stroke\.layerId\)/);
  assert.match(preview,/this\.history\.undo\(this\.photoshop\.enabled\?this\.photoshop\.activeLayerId:null\)/);
  assert.match(preview,/this\.history\.clear\(this\.photoshop\.enabled\?this\.photoshop\.activeLayerId:null\)/);
  assert.match(preview,/for\(const layer of this\.photoshop\.layers\)/);
  assert.match(preview,/if\(!layer\.visible\)continue/);
});

test('two independent PC toolbar windows use the same UI with different roles',()=>{
  const left=cfg.app.windows.find(x=>x.label==='toolbar');
  const right=cfg.app.windows.find(x=>x.label==='toolbar-right');
  assert.ok(left?.alwaysOnTop);
  assert.ok(right?.alwaysOnTop);
  assert.equal(left.url,right.url);
  assert.notEqual(left.width,right.width);
  assert.ok(capabilities.windows.includes('toolbar-right'));
  assert.match(toolbar,/getCurrentWindow\(\)\.label==='toolbar-right'/);
  assert.match(toolbar,/onPointerDown=\{beginToolbarDrag\}/);
  assert.match(rust,/for side in \["left","right"\]/);
  assert.match(rust,/for label in \["toolbar","toolbar-right"\]/);
  assert.match(rust,/fn position_toolbar\(app:&AppHandle,side:&str\)/);
  assert.match(rust,/fn reset_toolbar_position\(app:AppHandle,side:Option<String>\)/);
});

test('phone left and right rails move independently without sending canvas input',()=>{
  assert.match(pad,/railDrag=useRef/);
  assert.match(pad,/penstudy\.rail\.'/);
  assert.match(pad,/beginRailDrag\('left',e\)/);
  assert.match(pad,/beginRailDrag\('right',e\)/);
  assert.match(pad,/onPointerDown=\{begin\} onPointerMove=\{move\}/);
  assert.match(pad,/type:'toolbar-focus',side:'left'/);
  assert.match(pad,/type:'toolbar-focus',side:'right'/);
  assert.match(pad,/type:'toolbar-reset',side:'left'/);
  assert.match(pad,/type:'toolbar-reset',side:'right'/);
});
