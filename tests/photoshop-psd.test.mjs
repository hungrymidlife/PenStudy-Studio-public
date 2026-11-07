import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readPsd,writePsdUint8Array} from 'ag-psd';
import {DEFAULT_PHOTOSHOP,WHITE_BACKGROUND,validBackgroundColor,BRUSH_OPTIONS}
  from '../packages/protocol/photoshop.ts';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const pad=read('../apps/android/src/Pad.tsx');
const css=read('../apps/android/src/style.css');
const desktop=read('../apps/desktop/src/App.tsx');
const bridge=read('../apps/desktop/src-tauri/src/bridge.rs');
const native=read('../apps/desktop/src-tauri/src/lib.rs');
const ps=read('../apps/desktop/src-tauri/src/photoshop.rs');
const overlay=read('../apps/desktop/src/overlay.tsx');

test('default mobile board is white and custom hex color persists independently',()=>{
  assert.equal(WHITE_BACKGROUND,'#FFFFFF');
  assert.equal(validBackgroundColor('#ffffff'),true);
  assert.equal(validBackgroundColor('#BBAA22'),true);
  assert.equal(validBackgroundColor('red'),false);
  assert.match(pad,/penstudy\.boardColor\.v1/);
  assert.match(pad,/validBackgroundColor\(value\)\?value:WHITE_BACKGROUND/);
  assert.match(pad,/backgroundImage:'none'/);
  assert.match(pad,/aria-label="모바일 입력판 배경색"/);
  assert.match(css,/\.padwrap\{background-color:#fff;background-image:none\}/);
});

test('Photoshop state is authenticated, bounded, and layer operations are synchronized',()=>{
  assert.match(ps,/pub struct PhotoshopBus/);
  assert.match(ps,/pub fn get_photoshop/);
  assert.match(ps,/pub fn edit_photoshop/);
  assert.match(ps,/if next\.layers\.len\(\)>=24/);
  for(const action of ['add','select','hide','show','rename','delete','up','down','brush','enable']){
    assert.ok(ps.includes('"'+action+'"'),action);
  }
  assert.match(native,/PhotoshopBus::default\(\)/);
  assert.match(native,/photoshop::get_photoshop,photoshop::edit_photoshop/);
  assert.match(bridge,/let mut ps_rx=app\.state::<PhotoshopBus>\(\)\.0\.subscribe\(\)/);
  assert.ok(bridge.indexOf('if kind=="photoshop"')>bridge.indexOf('if token!=expected_token'));
  assert.match(bridge,/"type":"photoshop-state"/);
  assert.match(bridge,/"photoshop":initial_photoshop/);
  assert.match(bridge,/object\.insert\("layerId"\.into\(\)/);
  assert.match(bridge,/object\.insert\("brush"\.into\(\)/);
  assert.match(pad,/photoshopAction\('add'\)/);
  assert.match(pad,/photoshopAction\('rename'/);
  assert.match(pad,/photoshopAction\('delete'/);
});

test('brush presets are available in mobile and desktop without disrupting S Pen orientation',()=>{
  assert.deepEqual(BRUSH_OPTIONS.map(b=>b.value),['solid','marker','pencil','airbrush']);
  assert.equal(DEFAULT_PHOTOSHOP.enabled,false);
  assert.equal(DEFAULT_PHOTOSHOP.layers.length,1);
  assert.match(pad,/cycleBrush/);
  assert.match(desktop,/BRUSH_OPTIONS\.map/);
  assert.match(overlay,/case 'marker'/);
  assert.match(overlay,/case 'pencil'/);
  assert.match(overlay,/case 'airbrush'/);
  assert.match(overlay,/createRadialGradient/);
  assert.match(overlay,/globalCompositeOperation=stroke\.tool==='eraser'\?'destination-out':'source-over'/);
  assert.match(pad,/orientationchange/);
});

test('PSD exporter keeps editable bitmap layers in Photoshop top-to-bottom order',()=>{
  const pixels=(r,g,b,a)=>({
    width:2,height:2,
    data:new Uint8ClampedArray([r,g,b,a,r,g,b,a,r,g,b,a,r,g,b,a])
  });
  const psd=writePsdUint8Array({
    width:2,height:2,imageData:pixels(255,255,255,255),
    children:[
      {name:'맨 위',imageData:pixels(255,0,0,255)},
      {name:'숨긴 레이어',hidden:true,imageData:pixels(0,0,255,255)},
      {name:'PC 화면',imageData:pixels(255,255,255,255)}
    ]
  },{generateThumbnail:false});
  assert.equal(new TextDecoder().decode(psd.subarray(0,4)),'8BPS');
  assert.equal(psd[4],0);
  assert.equal(psd[5],1);
  // Node has no browser Canvas API. Keep the encoded bitmap channels in
  // raw form so the PSD parser can verify real layer data without createCanvas.
  const parsed=readPsd(psd,{useRawData:true,skipThumbnail:true});
  assert.equal(parsed.width,2);
  assert.equal(parsed.height,2);
  assert.deepEqual(parsed.children?.map(layer=>layer.name),['맨 위','숨긴 레이어','PC 화면']);
  assert.equal(parsed.children?.[1].hidden,true);
  // These are editable raster layers, not merely names or an embedded PNG.
  for(const layer of parsed.children??[]){
    assert.ok(layer.rawData?.channels?.some(channel=>channel.data?.byteLength>0),
      `Layer "${layer.name}" must retain encoded PSD channel data`);
  }
});

test('PSD capture saves a real header-validated binary and preserves separate layers',()=>{
  assert.match(overlay,/writePsdUint8Array/);
  assert.match(overlay,/photoshop\.current\.layers\.slice\(\)\.reverse\(\)/);
  assert.match(overlay,/children\.push\(\{name:'PC 화면',hidden:false,canvas:base\}\)/);
  assert.match(overlay,/await invoke<string>\('capture_desktop_base64'\)/);
  assert.match(overlay,/await invoke<string>\('save_psd'/);
  assert.match(overlay,/let binary=''/);
  assert.match(native,/async fn capture_desktop_base64/);
  assert.match(native,/async fn save_psd/);
  assert.match(native,/b"8BPS"/);
  assert.match(native,/format!\("PenStudy_\{\}\.psd"/);
  assert.match(bridge,/if kind=="psd"/);
  assert.match(bridge,/psd-requested/);
  assert.match(desktop,/레이어 포함 PSD 저장/);
});

test('Photoshop layer redraw respects visibility/order and limits erasure to selected layer',()=>{
  assert.match(overlay,/for\(const layer of photoshop\.current\.layers\)/);
  assert.match(overlay,/if\(!layer\.visible\)continue/);
  assert.match(overlay,/const target=layerSurface\(stroke\.layerId\)\.getContext\('2d'\)!/);
  assert.match(overlay,/compositeLayers\(\)/);
  assert.match(overlay,/history\.current\.undo\(currentLayerScope\(\)\)/);
  assert.match(overlay,/history\.current\.clear\(currentLayerScope\(\)\)/);
});
