import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_HOTKEYS,validHotkey,validHotkeyBindings,captureHotkey} from '../apps/desktop/src/hotkeys.ts';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const bridge=read('../apps/desktop/src-tauri/src/bridge.rs');
const native=read('../apps/desktop/src-tauri/src/lib.rs');
const hotkeys=read('../apps/desktop/src-tauri/src/hotkeys.rs');
const pad=read('../apps/android/src/Pad.tsx');
const overlay=read('../apps/desktop/src/overlay.tsx');
const preview=read('../apps/android/src/layerPreview.ts');
const toolbar=read('../apps/desktop/src/toolbar.tsx');
const app=read('../apps/desktop/src/App.tsx');

test('eraser selects an independent tool but keeps authenticated mouse/ink routing',()=>{
  assert.match(bridge,/pub enum InkTool \{ Pen, Eraser \}/);
  assert.match(bridge,/pub struct InkToolBus/);
  assert.match(bridge,/apply_ink_tool/);
  assert.match(bridge,/if kind=="ink-tool"/);
  assert.match(bridge,/"inkTool":initial_tool/);
  assert.match(bridge,/object\.insert\("tool"\.into\(\),json!\(\*tool_rx\.borrow\(\)\)\)/);
  assert.ok(bridge.indexOf('if kind=="ink-tool"')>bridge.indexOf('if token!=expected_token'));
  assert.match(native,/bridge::get_ink_tool,bridge::set_ink_tool/);
  assert.match(pad,/response\.inkTool==='eraser'/);
  assert.match(pad,/response\.type==='ink-tool'/);
  assert.match(pad,/send\(\{type:'ink-tool',tool\}\)/);
  assert.match(pad,/aria-label="S펜 지우개 전환"/);
  assert.match(toolbar,/onClick=\{\(\)=>chooseTool\('eraser'\)\}/);
});

test('direct eraser really makes ink transparent and undo replays both ink and eraser strokes',()=>{
  assert.match(overlay,/stroke\.tool==='eraser'\?'destination-out':'source-over'/);
  assert.match(overlay,/ERASER_WIDTH/);
  assert.match(overlay,/const tool=p\.tool==='eraser'\?'eraser':'pen'/);
  assert.match(overlay,/history\.current\.add\(stroke\)/);
  assert.match(overlay,/history\.current\.undo\(currentLayerScope\(\)\)/);
  assert.match(overlay,/for\(const stroke of history\.current\.strokes\)/);
  assert.match(preview,/ctx\.globalCompositeOperation=stroke\.tool==='eraser'\?'destination-out':'source-over'/);
  assert.match(preview,/ctx\.restore\(\)/);
});

test('global shortcut settings validate individual combinations and reject duplicates',()=>{
  for(const key of ['F1','F7','F8','F9','F10','F12','Ctrl+S','Ctrl+Shift+S','Alt+Q','Ctrl+Alt+1']){
    assert.equal(validHotkey(key),true,key);
  }
  for(const key of ['S','5','Alt+F4','F13','Ctrl+Ctrl+S','Ctrl+Space','Win+X','']){
    assert.equal(validHotkey(key),false,key);
  }
  assert.equal(validHotkeyBindings(DEFAULT_HOTKEYS),true);
  assert.equal(validHotkeyBindings({...DEFAULT_HOTKEYS,undo:'F9'}),false);
  assert.equal(captureHotkey({key:'s',ctrlKey:true,altKey:false,shiftKey:true,metaKey:false}),'Ctrl+Shift+S');
  assert.equal(captureHotkey({key:'s',ctrlKey:false,altKey:false,shiftKey:false,metaKey:false}),null);
  assert.equal(captureHotkey({key:'F8',ctrlKey:false,altKey:false,shiftKey:false,metaKey:false}),'F8');
  assert.equal(captureHotkey({key:'F4',ctrlKey:false,altKey:true,shiftKey:false,metaKey:false}),null);
  assert.equal(captureHotkey({key:'ㅁ',code:'KeyS',ctrlKey:true,altKey:false,shiftKey:false,metaKey:false}),'Ctrl+S');
  assert.equal(captureHotkey({key:'!',code:'Digit1',ctrlKey:true,altKey:false,shiftKey:true,metaKey:false}),'Ctrl+Shift+1');
});

test('Rust atomically swaps Windows shortcuts with rollback and an eraser toggle action',()=>{
  assert.match(native,/hotkeys::get_hotkeys,hotkeys::set_hotkeys/);
  assert.match(native,/hotkeys::handle_pressed/);
  assert.match(native,/hotkeys::initialize/);
  assert.match(hotkeys,/pub struct HotkeyBus/);
  assert.match(hotkeys,/pub fn set_hotkeys/);
  assert.match(hotkeys,/api\.unregister\(key\)/);
  assert.match(hotkeys,/api\.register\(key\)/);
  assert.match(hotkeys,/for value in added\{let _=api\.unregister\(value\);\}/);
  assert.match(hotkeys,/for \(_,old_key\) in previous\.entries\(\)/);
  assert.match(hotkeys,/bridge::apply_ink_tool/);
  assert.match(hotkeys,/bridge::apply_input_mode/);
});

test('desktop shortcut editing saves on successful registration only and documents live keys',()=>{
  assert.match(app,/captureKey\(action:HotkeyAction/);
  assert.match(app,/await invoke\('set_hotkeys',\{bindings\}\)/);
  assert.match(app,/storeHotkeys\(bindings\)/);
  assert.match(app,/hotkeyBusy/);
  assert.match(app,/사용자 지정 전역 단축키/);
  assert.match(app,/hotkeys\.save/);
  assert.match(app,/hotkeys\.eraser/);
  assert.match(toolbar,/hotkeys\.undo/);
  assert.match(toolbar,/hotkeys\.clear/);
  assert.match(toolbar,/hotkeys\.save/);
});

test('shortcut capture releases global keys while recording so F8/F9 are usable as new choices',()=>{
  assert.match(hotkeys,/pub struct HotkeyCaptureBus/);
  assert.match(hotkeys,/pub fn set_hotkey_capture_mode/);
  assert.match(hotkeys,/if active\{/);
  assert.match(hotkeys,/api\.unregister\(key\)/);
  assert.match(hotkeys,/api\.register\(key\)/);
  assert.match(native,/hotkeys::set_hotkey_capture_mode/);
  assert.match(app,/onFocus=\{e=>\{/);
  assert.match(app,/onBlur=\{\(\)=>/);
  assert.match(app,/await invoke\('set_hotkey_capture_mode',\{active:false\}\)/);
});

test('echoing an already-selected eraser never stops the active stroke',()=>{
  assert.match(pad,/const inkToolRef=useRef<InkTool>\('pen'\)/);
  assert.match(pad,/if\(inkToolRef\.current!==nextTool\)\{/);
  assert.match(pad,/inkToolRef\.current=tool/);
  assert.match(pad,/inkToolRef\.current=initialTool/);
  assert.match(pad,/preview\.current\.begin\(id,inkToolRef\.current,state\.brush,styleRef\.current,point\)/);
});

test('undo and clear work even when mouse mode was selected',()=>{
  assert.match(bridge,/else if matches!\(kind,"undo"\|"clear"\)\{/);
  assert.match(bridge,/let _=app\.emit\("pen-packet",v\)/);
});
