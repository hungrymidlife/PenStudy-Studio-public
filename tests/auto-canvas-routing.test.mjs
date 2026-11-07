import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_HOTKEYS,validHotkeyBindings}
  from '../apps/desktop/src/hotkeys.ts';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../apps/desktop/src/App.tsx');
const toolbar=read('../apps/desktop/src/toolbar.tsx');
const native=read('../apps/desktop/src-tauri/src/lib.rs');
const bridge=read('../apps/desktop/src-tauri/src/bridge.rs');
const mouse=read('../apps/desktop/src-tauri/src/desktop_mouse.rs');
const rustHotkeys=read('../apps/desktop/src-tauri/src/hotkeys.rs');
const settings=read('../apps/desktop/src/settings.ts');

test('all floating overlay tools support optional remappable shortcuts',()=>{
  assert.equal(validHotkeyBindings(DEFAULT_HOTKEYS),true);
  assert.equal(validHotkeyBindings({...DEFAULT_HOTKEYS,mouse:'Ctrl+Alt+M'}),true);
  assert.equal(validHotkeyBindings({...DEFAULT_HOTKEYS,ink:DEFAULT_HOTKEYS.save}),false);
  const actions=['save','region','fixed','undo','clear','eraser','mouse','ink',
    'pen','psd','configureRegion','penThinner','penThicker','eraserThinner',
    'eraserThicker','pressure','brush','photoshop','layerAdd','layerPrev',
    'layerNext','layerVisibility','colorNext','toolbarLeft','toolbarRight','routeToggle'];
  assert.equal(Object.keys(DEFAULT_HOTKEYS).length,actions.length);
  for(const action of actions){
    assert.ok(Object.hasOwn(DEFAULT_HOTKEYS,action),action);
    assert.ok(app.includes("['"+action+"',"),action+' UI control');
    assert.ok(rustHotkeys.includes('pub '+action+':String'),action+' native binding');
  }
  assert.match(rustHotkeys,/fn entries\(&self\)->\[\(&'static str,&str\);26\]/);
  assert.match(rustHotkeys,/#\[serde\(default\)\]/);
  assert.match(rustHotkeys,/if key\.is_empty\(\)\{continue;\}/);
  assert.match(app,/title=\{label\+' 단축키 해제'\}/);
  assert.match(app,/applyHotkeyBindings\(\{\.\.\.hotkeys,\[action\]:''\}\)/);
});

test('only recognized foreground drawing apps can receive automatic S Pen mouse events',()=>{
  assert.match(mouse,/GetForegroundWindow\(\)/);
  assert.match(mouse,/GetWindowThreadProcessId/);
  assert.match(mouse,/QueryFullProcessImageNameW/);
  for(const exe of ['photoshop.exe','mspaint.exe','krita.exe','paintdotnet.exe',
    'clipstudiopaint.exe','sai.exe']){
    assert.ok(mouse.includes('"'+exe+'"'),exe);
  }
  assert.doesNotMatch(mouse,/"chrome\.exe"\|"notepad\.exe"/);
  assert.match(bridge,/desktop_mouse::active_drawing_app\(\)/);
  assert.match(bridge,/mode==InputMode::Ink&&foreground_app\.is_some\(\)/);
  assert.match(bridge,/drawing_stroke_to_app && foreground_app!=active_stroke_app/);
  assert.match(bridge,/desktop_mouse::left_button\(false\)/);
  assert.match(bridge,/previous_app_stroke=drawing_stroke_to_app/);
  assert.match(bridge,/mode != InputMode::Mouse \|\| previous_app_stroke/);
  assert.match(bridge,/let route_mouse=mode==InputMode::Mouse/);
  assert.match(bridge,/app\.emit\("pen-packet",v\)/);
});

test('auto route can be toggled from settings, toolbar and a global shortcut',()=>{
  assert.match(settings,/autoCanvasRouting:true/);
  assert.match(app,/set_auto_canvas_routing/);
  assert.match(app,/get_active_drawing_app/);
  assert.match(app,/activeDrawingApp/);
  assert.match(toolbar,/get_auto_canvas_routing/);
  assert.match(toolbar,/auto-canvas-routing-changed/);
  assert.match(toolbar,/aria-label="그림 앱 자동 캔버스 연결"/);
  assert.match(rustHotkeys,/"routeToggle"=>/);
  assert.match(bridge,/pub struct DrawingRouteBus/);
  assert.match(bridge,/pub fn get_auto_canvas_routing/);
  assert.match(bridge,/pub fn set_auto_canvas_routing/);
  assert.match(native,/\.manage\(DrawingRouteBus::default\(\)\)/);
  assert.match(native,/get_active_drawing_app/);
});

test('saving and layer operations remain separate from external app painting',()=>{
  assert.match(bridge,/if kind=="save"/);
  assert.match(bridge,/matches!\(kind,"undo"\|"clear"\)/);
  assert.match(bridge,/object\.insert\("layerId"\.into\(\)/);
  assert.match(rustHotkeys,/"layerAdd"/);
  assert.match(rustHotkeys,/"layerVisibility"/);
  assert.match(rustHotkeys,/"psd"=>\{let _=app\.emit\("psd-requested"/);
  assert.match(native,/request_action,save_capture,save_psd/);
});
