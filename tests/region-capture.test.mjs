import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_HOTKEYS,validHotkeyBindings} from '../apps/desktop/src/hotkeys.ts';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const native=read('../apps/desktop/src-tauri/src/lib.rs');
const nativeHotkeys=read('../apps/desktop/src-tauri/src/hotkeys.rs');
const overlay=read('../apps/desktop/src/overlay.tsx');
const app=read('../apps/desktop/src/App.tsx');

test('both new captures have distinct, user-assignable global shortcuts',()=>{
  assert.equal(validHotkeyBindings(DEFAULT_HOTKEYS),true);
  assert.equal(validHotkeyBindings({...DEFAULT_HOTKEYS,region:DEFAULT_HOTKEYS.fixed}),false);
  assert.deepEqual(
    [DEFAULT_HOTKEYS.region,DEFAULT_HOTKEYS.fixed],
    ['Ctrl+Shift+1','Ctrl+Shift+2']
  );
  for(const action of ['region','fixed']){
    assert.match(nativeHotkeys,new RegExp('"'+action+'"=>'));
    assert.ok(app.includes("['"+action+"',"),action);
  }
  assert.match(nativeHotkeys,/fn entries\(&self\)->\[\(&'static str,&str\);26\]/);
});

test('selection mode temporarily enables mouse input and restores click through',()=>{
  assert.match(native,/fn set_capture_selection_active/);
  assert.match(native,/set_ignore_cursor_events\(!active\)/);
  assert.match(overlay,/selectionDown/);
  assert.match(overlay,/selectionMove/);
  assert.match(overlay,/selectionUp/);
  assert.match(overlay,/setPointerCapture\(e\.pointerId\)/);
  assert.match(overlay,/event\.key==='Escape'/);
  assert.match(overlay,/set_capture_selection_active',\{active:false\}/);
  assert.match(overlay,/region\.width\*window\.innerWidth<6/);
});

test('chosen area is remembered and editable without forcing an immediate capture',()=>{
  assert.match(native,/fn set_fixed_capture_region/);
  assert.match(native,/fn get_fixed_capture_region/);
  assert.match(native,/fn clear_fixed_capture_region/);
  assert.match(native,/app\.path\(\)\.app_config_dir\(\)/);
  assert.match(native,/capture-region\.json/);
  assert.match(native,/self\.x\+self\.width>1\.000001/);
  assert.match(overlay,/if\(mode==='fixed'\)await invoke\('set_fixed_capture_region',\{region\}\)/);
  assert.match(app,/action\('configure-region'\)/);
  assert.match(app,/action\('fixed'\)/);
  assert.match(app,/clearFixedRegion\(\)/);
});

test('single capture crops merged desktop and ink, while full screen and PSD remain intact',()=>{
  const composite=native.indexOf('overlay(&mut picture,&painted,left,top)');
  const crop=native.indexOf('crop_imm(&picture,x,y,w,h)');
  assert.ok(composite>=0&&crop>composite);
  assert.match(native,/region:Option<CaptureRegion>/);
  assert.match(native,/if let Some\(rect\)=region/);
  assert.match(native,/else\{picture\}/);
  assert.match(native,/async fn capture_desktop_base64/);
  assert.match(overlay,/const png=canvas\.toDataURL\('image\/png'\)/);
  // All PNG types share the same savePng flow, and none clears ink automatically.
  assert.doesNotMatch(overlay,/settings\.current\.autoClear/);
  assert.doesNotMatch(overlay,/overlay-cleared/);
  assert.doesNotMatch(overlay,/clearInk\(\);\s*await emit\('overlay-cleared'/);
  assert.match(overlay,/if\(p\.type==='clear'\)\{clearInk\(\);return;\}/);
  assert.match(overlay,/listen\('clear-requested',\(\)=>\{clearInk\(\);\}\)/);
  assert.match(overlay,/writePsdUint8Array/);
  assert.match(app,/현재 화면 PNG 저장/);
});
