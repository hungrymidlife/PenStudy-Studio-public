# PenStudy Studio · 오픈소스 공개 전 점검표

기준: **2026-11-07**, `hungrymidlife/PenStudy-Studio-public`의 GitHub `main` 소스와 의존성 선언을 대상으로 한 **예비 점검**.

> **판단:** 현재 확인한 소스·직접 의존성 기준으로 PenStudy 원본 코드를 **MIT 라이선스**로 공개하는 데 명백한 라이선스 충돌은 발견되지 않았습니다. 그러나 **모든 제3자 코드의 권리·라이선스와 Git 전체 기록·이미지 제작자까지 검증했다고 볼 수는 없습니다.** 따라서 `LICENSE` 추가와 저장소 **공개(public) 전환은 별도의 결정**으로 취급합니다. 최종 법률 의견이나 완전한 보안 감사는 아닙니다.

## 선택한 프로젝트 라이선스

- **프로젝트 자체 원본 코드:** 루트 [`LICENSE`](../LICENSE) = **MIT**, Copyright (c) 2026 **hungrymidlife**. 저장소 소유자 계정명을 저작권 표기에 사용했습니다. 실제 권리자 표시가 다르면 공개 전에 수정하세요.
- **선택 이유:** 현재 핵심 외부 패키지가 MIT/ISC/Apache-2.0 등 허용형 라이선스를 채택하고 있으며, 소스를 공개하고 개인·상용 사용과 포크를 폭넓게 허용하기에 적합합니다. **GPL-3.0-only** 역시 주요 직접 의존성과 호환될 가능성이 있지만, 배포 시 파생 저작물의 소스 제공 의무를 원한다는 의사가 확인되지 않아 **MIT를 기본 선택**했습니다.
- **중요한 효과:** MIT는 **폐쇄형 상업 포크도 허용**합니다. 타인이 배포하는 수정판의 소스 공개가 필수 조건이기를 원하면 **GPL-3.0-only** 등 카피레프트 선택을 공개 전에 다시 검토해야 합니다.
- **저작권 귀속:** 루트 MIT 표기는 사용자가 라이선스할 권리를 가진 소스에 적용합니다. 제3자 라이브러리·개별 벤더 코드의 저작권·라이선스를 덮어쓰지 않습니다.

## 확인된 사항

| 확인 항목 | 확인 내용 | 판정 |
| --- | --- | --- |
| 저장소 상태 | GitHub `private`, 기존 `license: null` | 루트 `LICENSE` 추가, 공개 전환은 하지 않음 |
| JavaScript 잠금 파일 | `package-lock.json`의 외부 `node_modules` 패키지 **138개** 확인. 주로 MIT·Apache-2.0·ISC·BSD-3-Clause, 기타 `CC-BY-4.0`(`caniuse-lite`), `MIT AND Zlib` 등 | 잠금 파일 메타데이터 기준 GPL 계열 미발견. **실제 원문·권리자 확인은 별도** |
| 직접 npm 의존성 | React, Lucide, ag-psd, Tauri JS 패키지 등 | 목록 [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) |
| Windows Rust | `apps/desktop/src-tauri/Cargo.lock`에 패키지 항목 **611개**. 잠금 파일 자체에는 LICENSE 필드 없음 | 주요 직접 크레이트 확인. **간접·타깃별 전체 라이선스 검증 필요** |
| xcap | `xcap 0.9.8`의 upstream Cargo.toml에 `Apache-2.0` 명시 | MIT 프로젝트와 함께 사용 가능, 별도 고지 의무 유지 |
| 벤더 QR 코드 | `apps/desktop/src/vendor/qrcodegen.ts` 상단에 **Project Nayuki / MIT License** 원문 고지 | 원저작권 표시 유지. [원출처](https://www.nayuki.io/page/qr-code-generator-library) |
| Android 네이티브 | `tauri-plugin-barcode-scanner` 및 로컬 `tauri-plugin-immersive`와 AndroidX 연동 코드 | Android 생성 프로젝트 및 **Gradle 의존성 전체 미검증** |
| 비밀정보 예비 검색 | 검토한 주요 코드·설정·스크립트·백업 파일에 개인키 시작 구문, 대표 GitHub/AWS 키 패턴, 긴 하드코딩된 비밀 값은 발견되지 않음 | **일부 파일의 규칙 기반 점검만 수행**; Git 과거 커밋과 숨겨진 형식 미검증 |
| 저장소 무시 규칙 | `.gitignore`에 `.env*`, `*.local`, `node_modules`, `target`, `src-tauri/gen` 등을 지정 | 미래의 실수 방지에 도움. **기존 추적 파일·이력은 지워지지 않음** |
| 이미지/아이콘 | `apps/*/src-tauri/icons/`의 PNG/ICO 등 바이너리 | **원본 제작/사용/공개 권리 미확인** |

## 공개로 전환하기 전에 할 일

- [ ] [권리 확인] 프로젝트 이름과 저작권자 표기 `hungrymidlife`가 실제 권리자/기여자의 허가와 일치하는지 확인
- [ ] [외부 코드] 기존 벤더 파일 `qrcodegen.ts`의 Project Nayuki MIT 고지를 유지하고, 제3자에서 복사한 추가 소스가 없는지 확인
- [ ] [리소스] 데스크톱·Android 아이콘을 직접 제작했거나 공개/재배포 허가가 있는 이미지로 구성했는지 검토
- [ ] [기록] 현재 파일뿐 아니라 **Git의 모든 브랜치·태그·과거 커밋**에 API 키, 인증 토큰, 인증서, 이메일, 개인정보, 비공개 서비스 정보가 포함된 적 없는지 점검. 발견 시 먼저 키를 **폐기/교체**하고 이력 정리 범위를 판단
- [ ] [Rust] Windows 및 Android에서 실제 사용하는 Rust **간접 크레이트** 전체를 라이선스 스캐너(`cargo-deny`/`cargo-about` 등)로 확인, 필요한 LICENSE/NOTICE 수집
- [ ] [Android] 앱을 초기화·빌드한 환경에서 **Gradle/Maven 및 Android SDK 종속성**의 라이선스 목록과 귀속을 확인
- [ ] [JS] `npm ci` 후 프로덕션 번들에 들어가는 직접·간접 종속성에 필요한 라이선스 고지 제공. `caniuse-lite` 등 npm 메타데이터가 MIT가 아닌 항목도 확인
- [ ] [실행/품질] `npm run typecheck`, `npm test`, Windows 포터블·설치형, Android APK 실제 빌드/실행 확인
- [ ] [배포] 최종 EXE/ZIP/APK에 필요한 **제3자 LICENSE 원문 및 NOTICE**를 함께 제공
- [ ] [공개 설정] 모든 점검을 마친 후에만 GitHub `Settings → General → Danger Zone → Change repository visibility`에서 사용자가 **직접** 공개 여부를 결정

## 참고

- [MIT License 원문](https://choosealicense.com/licenses/mit/)
- [GitHub: Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
- [Apache-2.0 / GPLv3 compatibility](https://www.apache.org/licenses/GPL-compatibility.html)
- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)

이 문서는 **최초 검토 범위**를 기록한 것으로, 오픈소스 공개를 보증하는 인증서가 아닙니다. 라이브러리와 권리관계가 변경되면 다시 확인해야 합니다.
