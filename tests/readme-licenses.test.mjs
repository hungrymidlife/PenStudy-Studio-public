import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const readme = read('../README.md');
const notices = read('../THIRD_PARTY_NOTICES.md');
const lock = JSON.parse(read('../package-lock.json'));
const desktopCargo = read('../apps/desktop/src-tauri/Cargo.toml');
const androidCargo = read('../apps/android/src-tauri/Cargo.toml');

test('README has current builds, features and license navigation', () => {
  for (const target of [
    '## 빌드 및 실행 명령어',
    'npm run desktop:build',
    'build --no-bundle',
    'npm run android:apk',
    'android build --apk',
    'npm run typecheck',
    'npm test',
    '[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)',
    '## 서드파티 라이선스 및 저작권 고지',
    '26개 동작',
    '저장해도 필기는 그대로 유지'
  ]) {
    assert.ok(readme.includes(target), target);
  }
  assert.doesNotMatch(readme, /저장 성공 후 필기 자동 초기화 기본 켬/);
  assert.doesNotMatch(readme, /자동 저장 후 지우기는 기존대로 동작/);
  assert.doesNotMatch(readme, /\| 색상·두께·저장 폴더·자동 초기화 \|/);
});

test('third party notices match all direct npm dependencies', () => {
  const manifests = [
    JSON.parse(read('../package.json')),
    JSON.parse(read('../apps/desktop/package.json')),
    JSON.parse(read('../apps/android/package.json'))
  ];
  const names = new Set();
  for (const manifest of manifests) {
    for (const name of Object.keys({...manifest.dependencies, ...manifest.devDependencies})) {
      names.add(name);
    }
  }
  for (const name of names) {
    const dependency = lock.packages['node_modules/' + name];
    assert.ok(dependency, 'package-lock entry missing: ' + name);
    assert.ok(dependency.license, 'SPDX metadata missing: ' + name);
    assert.ok(notices.includes(name), 'not listed: ' + name);
    assert.ok(notices.includes(dependency.version), 'version missing: ' + name);
    assert.ok(notices.includes(dependency.license), 'license missing: ' + name);
  }
});

test('native direct dependencies and release-compliance cautions are documented', () => {
  for (const name of ['tauri','tauri-plugin-global-shortcut','tauri-plugin-dialog',
    'tokio','tokio-tungstenite','futures-util','serde','serde_json','uuid','image',
    'xcap','base64','chrono','dirs']) {
    assert.match(desktopCargo, new RegExp('^' + name + '\\s*=', 'm'));
    assert.ok(notices.includes(name), name);
  }
  assert.match(androidCargo,/tauri-plugin-barcode-scanner/);
  assert.match(notices,/tauri-plugin-barcode-scanner/);
  assert.match(notices,/\| xcap \| 0\.9\.8 \|[^\n]*Apache-2\.0/);
  assert.match(notices,/프로젝트 자체 라이선스/);
  assert.match(notices,/apps\/desktop\/src\/vendor\/qrcodegen\.ts/);
  assert.match(notices,/Project Nayuki/);
  assert.match(notices,/루트 MIT 선언은 외부 코드의 저작권을 이전/);
  assert.match(notices,/간접 의존성/);
  assert.match(notices,/LICENSE\/NOTICE/);
});
