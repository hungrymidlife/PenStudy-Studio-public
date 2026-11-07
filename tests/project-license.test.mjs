import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('PenStudy original source declares a complete MIT license',()=>{
  // Windows exports may add a UTF-8 BOM or use CRLF line endings.
  // Neither changes the MIT license text or its legal meaning.
  const license=read('../LICENSE').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  assert.ok(license.startsWith('MIT License\n'));
  assert.ok(license.includes('Copyright (c) 2026 hungrymidlife'));
  assert.ok(license.includes('Permission is hereby granted, free of charge'));
  assert.ok(license.includes('The above copyright notice and this permission notice'));
  assert.ok(license.includes('THE SOFTWARE IS PROVIDED "AS IS"'));
  assert.ok(license.includes('LIABILITY, WHETHER IN AN ACTION OF CONTRACT'));
});

test('first-party JavaScript and Rust packages consistently declare MIT',()=>{
  for(const file of ['../package.json','../apps/desktop/package.json','../apps/android/package.json']){
    assert.equal(JSON.parse(read(file)).license,'MIT',file);
  }
  for(const file of [
    '../apps/desktop/src-tauri/Cargo.toml',
    '../apps/android/src-tauri/Cargo.toml',
    '../plugins/tauri-plugin-immersive/Cargo.toml'
  ]){
    assert.match(read(file),/^license = "MIT"$/m,file);
  }
});

test('vendored Nayuki code retains its own copyright and MIT license',()=>{
  const vendor=read('../apps/desktop/src/vendor/qrcodegen.ts');
  assert.ok(vendor.includes('Copyright (c) Project Nayuki. (MIT License)'));
  assert.ok(vendor.includes('https://www.nayuki.io/page/qr-code-generator-library'));
  assert.ok(vendor.includes('Permission is hereby granted, free of charge'));
  assert.ok(vendor.includes('The above copyright notice and this permission notice'));

  const notice=read('../THIRD_PARTY_NOTICES.md');
  assert.ok(notice.includes('Project Nayuki'));
  assert.ok(notice.includes('apps/desktop/src/vendor/qrcodegen.ts'));
  assert.ok(notice.includes('저작권·MIT 허가 및 면책 고지'));
});

test('open source checklist separates license adoption from making the repo public',()=>{
  const readme=read('../README.md');
  const checklist=read('../docs/OPEN_SOURCE_RELEASE_CHECKLIST.md');
  const notice=read('../THIRD_PARTY_NOTICES.md');
  assert.ok(readme.includes('[`MIT License`](LICENSE)'));
  assert.ok(readme.includes('GitHub 공개 전 확인'));
  assert.ok(readme.includes('[오픈소스 공개 점검표](docs/OPEN_SOURCE_RELEASE_CHECKLIST.md)'));
  assert.ok(checklist.includes('Git의 모든 브랜치·태그·과거 커밋'));
  assert.ok(checklist.includes('이미지/아이콘'));
  assert.ok(checklist.includes('간접 크레이트'));
  assert.ok(checklist.includes('공개(public) 전환은 별도의 결정'));
  assert.ok(notice.includes('루트 MIT 선언은 외부 코드의 저작권을 이전'));
});
