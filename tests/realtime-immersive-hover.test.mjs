import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=relative=>readFileSync(new URL(relative,import.meta.url),'utf8');
const android=read('../apps/android/src/Pad.tsx');
const desktop=read('../apps/desktop/src/overlay.tsx');
const relay=read('../apps/desktop/src-tauri/src/bridge.rs');
const manifests=read('../scripts/patch-android-manifest.ps1');

test('full-screen pad hides Android system bars and normal pad restores them',()=>{
  const bridge=read('../apps/android/src-tauri/src/lib.rs');
  const kotlin=read('../plugins/tauri-plugin-immersive/android/src/main/java/com/penstudy/immersive/ImmersivePlugin.kt');
  const cap=read('../apps/android/src-tauri/capabilities/default.json');
  const plugin=read('../plugins/tauri-plugin-immersive/src/lib.rs');
  assert.match(android,/invoke\('set_immersive',\{enabled:isFullPad\}\)/);
  assert.match(android,/const isFullPad=connected&&fullPad;/);
  assert.match(kotlin,/controller\.hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/);
  assert.match(kotlin,/controller\.show\(WindowInsetsCompat\.Type\.systemBars\(\)\)/);
  assert.match(kotlin,/BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/);
  assert.match(bridge,/generate_handler!\[set_immersive\]/);
  assert.match(plugin,/register_android_plugin/);
  assert.match(cap,/penstudy-immersive:default/);
});
test('S Pen hover is transmitted before touch and received by the overlay',()=>{
  assert.match(android,/onPointerEnter=\{hover\}/);
  assert.match(android,/onPointerLeave=\{leaveHover\}/);
  assert.match(android,/type:'hover'/);
  assert.match(android,/type:'hover-end'/);
  assert.match(relay,/"hover"\|"hover-end"/);
  assert.match(desktop,/p\.type==='hover'/);
  assert.match(desktop,/p\.type==='hover-end'/);
  assert.match(desktop,/cursor\.style\.transform/);
});
test('ink packets avoid TCP buffering, batch coalesced points and draw immediately',()=>{
  assert.match(relay,/stream\.set_nodelay\(true\)/);
  assert.match(relay,/"move-batch"/);
  assert.match(android,/getCoalescedEvents/);
  assert.match(android,/type:'move-batch'/);
  assert.match(desktop,/p\.type==='move-batch'/);
  assert.match(desktop,/drawSegment\(stroke,previous,point\)/);
  assert.doesNotMatch(desktop,/requestAnimationFrame\s*\(/);
});
test('existing screen auto-rotation remains unchanged',()=>{
  assert.match(manifests,/android:screenOrientation="fullSensor"/);
  assert.doesNotMatch(manifests,/sensorLandscape/);
});
