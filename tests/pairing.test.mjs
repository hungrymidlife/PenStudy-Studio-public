import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodePairing,encodePairing,isPrivateOrLoopbackIpv4,PAIRING_PORT} from '../packages/protocol/pairing.ts';

const token='a'.repeat(32);
test('Wi-Fi and USB pairing QR round-trip',()=>{
  for(const pairing of [
    {host:'192.168.219.103',mode:'wifi',port:PAIRING_PORT,token},
    {host:'10.1.2.3',mode:'wifi',port:PAIRING_PORT,token},
    {host:'127.0.0.1',mode:'usb',port:PAIRING_PORT,token}
  ])assert.deepEqual(decodePairing(encodePairing(pairing)),pairing);
});
test('QR scanner rejects external addresses, incorrect tokens and unexpected fields',()=>{
  assert.equal(isPrivateOrLoopbackIpv4('8.8.8.8'),false);
  assert.equal(isPrivateOrLoopbackIpv4('100.105.237.50'),false);
  for(const host of ['0.0.0.0','8.8.8.8','192.168.1.999','evil.example.com','192.168.001.2'])
    assert.throws(()=>encodePairing({host,mode:'wifi',port:PAIRING_PORT,token}));
  assert.throws(()=>encodePairing({host:'192.168.0.3',mode:'wifi',port:40000,token}));
  assert.throws(()=>encodePairing({host:'192.168.0.3',mode:'wifi',port:PAIRING_PORT,token:'secret'}));
  const good=encodePairing({host:'192.168.0.3',mode:'wifi',port:PAIRING_PORT,token});
  for(const bad of [good+'&token=duplicate',good+'&extra=1',good.replace('v=1','v=2'),good.replace('192.168.0.3','8.8.8.8'),'https://example.com?q=hello'])assert.throws(()=>decodePairing(bad));
});
test('Android native camera and Vite HMR are configured',()=>{
  const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
  const vite=read('../apps/android/vite.config.ts');
  const manifest=read('../scripts/patch-android-manifest.ps1');
  const mobile=read('../apps/android/src/Pad.tsx');
  const capability=read('../apps/android/src-tauri/capabilities/default.json');
  const rust=read('../apps/android/src-tauri/src/lib.rs');
  const desktop=read('../apps/desktop/src/App.tsx');
  assert.match(vite,/TAURI_DEV_HOST/);
  assert.match(vite,/hmr:/);
  assert.match(manifest,/android\.permission\.CAMERA/);
  assert.match(mobile,/barcode-scanner\|scan/);
  assert.match(mobile,/decodePairing/);
  assert.match(rust,/tauri_plugin_barcode_scanner::init/);
  assert.match(capability,/barcode-scanner:allow-scan/);
  assert.match(desktop,/PairingQRCode/);
});
