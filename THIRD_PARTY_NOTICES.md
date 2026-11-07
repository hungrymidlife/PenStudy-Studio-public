# 서드파티 소프트웨어 및 라이선스 고지

이 문서는 **PenStudy Studio(Windows)** 와 **PenStudy Pad(Android)** 가 사용하는 주요 오픈소스 의존성의 출처와 라이선스를 정리합니다.

> **프로젝트 자체 라이선스:** 저장소의 [`LICENSE`](LICENSE)는 **hungrymidlife가 라이선스할 권리를 가진 PenStudy 원본 코드**에 MIT 라이선스를 부여합니다. 아래 외부 라이브러리·원 저작권자가 있는 벤더 코드는 **각 저작권자의 기존 라이선스**가 우선 적용됩니다. 루트 MIT 선언은 외부 코드의 저작권을 이전하거나 라이선스 고지를 덮어쓰지 않습니다.
>
> 아래 목록은 **직접 선언된 주요 의존성의 고지/점검용 목록**입니다. 모든 간접 의존성 및 바이너리 내 구성요소의 라이선스 원문을 포괄하는 완성된 배포용 NOTICE 묶음은 아닙니다. 실제 EXE/APK를 제3자에게 배포하기 전에는 **플랫폼별 최종 종속성 전체**를 다시 확인해야 합니다.

## 1. JavaScript / TypeScript 라이브러리

버전과 SPDX 라이선스는 저장소의 `package-lock.json`에서 확인했습니다. `npm install` 후 잠금 파일이 갱신되면 아래 표도 갱신해야 합니다.

| 패키지 | 확인 버전 | SPDX 라이선스 | 공식 출처 |
| --- | --- | --- | --- |
| React | 18.3.1 | MIT | [react](https://github.com/facebook/react) |
| React DOM | 18.3.1 | MIT | [react-dom](https://github.com/facebook/react) |
| Lucide React (`lucide-react`) | 0.468.0 | ISC | [lucide](https://github.com/lucide-icons/lucide) |
| ag-psd | 34.1.0 | MIT | [ag-psd](https://github.com/Agamnentzar/ag-psd) |
| @tauri-apps/api | 2.12.4 | Apache-2.0 OR MIT | [Tauri](https://github.com/tauri-apps/tauri) |
| @tauri-apps/plugin-dialog | 2.8.4 | MIT OR Apache-2.0 | [Tauri Plugins](https://github.com/tauri-apps/plugins-workspace) |
| @tauri-apps/plugin-global-shortcut | 2.4.1 | MIT OR Apache-2.0 | [Tauri Plugins](https://github.com/tauri-apps/plugins-workspace) |
| @tauri-apps/cli *(빌드 도구)* | 2.12.4 | Apache-2.0 OR MIT | [Tauri](https://github.com/tauri-apps/tauri) |
| Vite *(빌드 도구)* | 5.4.21 | MIT | [Vite](https://github.com/vitejs/vite) |
| @vitejs/plugin-react *(빌드 도구)* | 4.7.0 | MIT | [Vite](https://github.com/vitejs/vite-plugin-react) |
| TypeScript (`typescript`, 빌드 도구) | 5.9.3 | Apache-2.0 | [TypeScript](https://github.com/microsoft/TypeScript) |
| @types/node *(타입 정의)* | 24.10.1 | MIT | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @types/react *(타입 정의)* | 18.3.31 | MIT | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @types/react-dom *(타입 정의)* | 18.3.7 | MIT | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |

위 표에 **빌드 도구나 타입 정의**가 포함되었다고 해서 반드시 최종 앱 바이너리에 모두 포함된다는 뜻은 아닙니다. 실제 배포 대상은 번들 결과물을 기준으로 확인하세요.

### 저장소에 직접 포함된 벤더 소스

| 파일 | 원저작권자·원본 | 라이선스 | 공개 시 준수 사항 |
| --- | --- | --- | --- |
| `apps/desktop/src/vendor/qrcodegen.ts` | **Project Nayuki** · [QR Code generator library](https://www.nayuki.io/page/qr-code-generator-library) ([GitHub 원본](https://github.com/nayuki/QR-Code-generator)) | **MIT** | 소스 상단에 포함된 **Project Nayuki의 저작권·MIT 허가 및 면책 고지**를 원본 그대로 유지 |

이 코드는 PenStudy가 새로 저작한 구현물이 아닌 **외부 소스의 복사본**입니다. 루트 `LICENSE`의 `Copyright (c) 2026 hungrymidlife` 표시를 이 코드의 원저작권자로 오인해서는 안 됩니다. 소스에 포함된 MIT 고지를 제거하거나 다른 저작권자 명의로 바꾸지 마세요.

## 2. Rust / Tauri 직접 의존성

다음 항목은 `apps/desktop/src-tauri/Cargo.toml`의 직접 의존성을 기준으로 합니다. 버전은 데스크톱 `Cargo.lock`에 고정된 관련 패키지 버전을 표시했습니다. 라이선스는 upstream 크레이트 및 프로젝트에 게시된 SPDX 정보를 기준으로 정리했습니다.

| 크레이트 | 확인된 버전 | 주요 용도 | SPDX 라이선스 · 출처 |
| --- | --- | --- | --- |
| tauri | 2.12.5 | Windows/Android 앱 런타임 | Apache-2.0 OR MIT · [Tauri](https://github.com/tauri-apps/tauri) |
| tauri-build | 2.7.4 | Tauri 빌드 | Apache-2.0 OR MIT · [Tauri](https://github.com/tauri-apps/tauri) |
| tauri-plugin-global-shortcut | 2.4.1 | Windows 전역 단축키 | Apache-2.0 OR MIT · [Tauri Plugins](https://github.com/tauri-apps/plugins-workspace) |
| tauri-plugin-dialog | 2.8.4 | 시스템 파일 선택 | Apache-2.0 OR MIT · [Tauri Plugins](https://github.com/tauri-apps/plugins-workspace) |
| tokio | 1.54.1 | 비동기 네트워크 런타임 | MIT · [Tokio](https://github.com/tokio-rs/tokio) |
| tokio-tungstenite | 0.26.2 | WebSocket | MIT · [tokio-tungstenite](https://github.com/snapview/tokio-tungstenite) |
| futures-util | 0.3.34 | 비동기 스트림 처리 | MIT OR Apache-2.0 · [futures-rs](https://github.com/rust-lang/futures-rs) |
| serde | 1.0.229 | 직렬화 | MIT OR Apache-2.0 · [Serde](https://github.com/serde-rs/serde) |
| serde_json | 1.0.154 | JSON | MIT OR Apache-2.0 · [serde_json](https://github.com/serde-rs/json) |
| uuid | 1.29.0 | 식별자 생성 | MIT OR Apache-2.0 · [uuid](https://github.com/uuid-rs/uuid) |
| image | 0.25.10 | PNG/레이어 이미지 처리 | MIT OR Apache-2.0 · [image-rs](https://github.com/image-rs/image) |
| xcap | 0.9.8 | 화면 캡처 | **Apache-2.0** · [xcap](https://github.com/nashaofu/xcap) |
| base64 | 0.22.1 *(직접 사용 버전)* | 이미지/데이터 인코딩 | MIT OR Apache-2.0 · [base64](https://github.com/marshallpierce/rust-base64) |
| chrono | 0.4.45 | 시간/파일명 | MIT OR Apache-2.0 · [chrono](https://github.com/chronotope/chrono) |
| dirs | 6.0.0 *(직접 사용 버전)* | 사용자 디렉터리 | MIT OR Apache-2.0 · [dirs-rs](https://github.com/dirs-dev/dirs-rs) |

**Android 전용:** `tauri-plugin-barcode-scanner`는 `apps/android/src-tauri/Cargo.toml`에 `2.5.2`로 선언되어 있으며 Tauri 플러그인 프로젝트의 MIT/Apache-2.0 계열 조건을 따릅니다. 실제 Android에서 해결된 버전과 추가 Android/Gradle 종속성은 **Android 빌드 결과**로 재확인해야 합니다. [Tauri Barcode Scanner](https://github.com/tauri-apps/plugins-workspace)

**저장소 내 로컬 코드:** `plugins/tauri-plugin-immersive`는 이 저장소에 포함된 PenStudy 전용 로컬 플러그인입니다. 외부에서 가져온 완성형 서드파티 플러그인으로 잘못 표기하지 않습니다. 단, 이 플러그인이 사용하는 Tauri·Android 구성요소는 각각의 라이선스를 따릅니다.

## 3. 라이선스 원문과 조건

- [MIT License](https://opensource.org/license/mit): 원 저작권 표시와 라이선스·면책 조항을 유지합니다.
- [ISC License](https://opensource.org/license/isc-license-txt): 저작권 표시 및 허가·면책 고지를 유지합니다.
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0): 라이선스 원문 제공, 해당되는 수정 사항·저작권 및 `NOTICE` 고지 유지 등의 조건을 확인합니다.
- `MIT OR Apache-2.0`은 동일 패키지에 대해 저작권자가 표시한 **대체 라이선스 선택**을 뜻합니다. `MIT`, `ISC`, `Apache-2.0`을 PenStudy 전체의 라이선스로 혼용하는 의미가 아닙니다.
- 위 웹 링크만 포함했다고 해서 설치 파일·포터블 EXE·APK의 배포 의무가 자동으로 완료되지는 않습니다. 해당 **패키지 버전의 실제 LICENSE/NOTICE 원문과 저작권자 표기**를 확인하고 최종 배포물이나 동봉 고지에 포함해야 합니다.

## 4. 릴리스 전 반드시 확인할 항목

1. `npm ci`로 `package-lock.json`의 실제 JS 의존성을 복원하고, **실제 앱에 번들되는 직접·간접 패키지**의 LICENSE/NOTICE 원문을 수집합니다.
2. Windows에서 `apps/desktop/src-tauri/Cargo.lock` 기준으로 **cargo 의존성 전체**의 정확한 패키지 버전, 라이선스 식별자, 원문, `NOTICE`를 확인합니다. 목록에는 Tauri/WebView 주변 시스템 크레이트도 다수 존재합니다.
3. Android 릴리스 시 `apps/android/src-tauri/gen/android` 생성 후 **Gradle/Android 라이브러리 및 Rust 의존성**을 실제 빌드 결과로 별도 검사합니다. Android는 데스크톱 Rust 잠금 파일만으로 완전한 검증이 불가능합니다.
4. 타사 이미지, 로고, 폰트, 아이콘 또는 기타 리소스를 새로 포함하는 경우 소스코드 라이선스와 별도로 배포·표시 권한을 확인합니다.
5. 실제 배포하는 **EXE 설치 프로그램, 포터블 ZIP, APK마다** 각 구성요소에 필요한 고지와 라이선스 텍스트가 사용자에게 제공되는지 확인합니다.
6. 프로젝트 원본 코드에 대한 **루트 [`LICENSE`](LICENSE) (MIT)**가 적용됩니다. 공개 전에 본인의 저작권 또는 라이선스 허가를 확인하세요. 벤더 코드에는 **원저작권자의 라이선스**를 계속 적용합니다.

## 5. 플랫폼 구성요소

- **Microsoft Edge WebView2 Runtime**은 Windows Tauri 앱의 웹 렌더링에 사용되는 Microsoft 런타임입니다. 이 문서의 MIT/Apache-2.0 서드파티 라이브러리 표와는 별도로 **Microsoft의 적용 약관**을 확인해야 합니다.
- Android의 **System WebView, Android SDK/NDK, Gradle 및 플랫폼 구성요소**에도 각각의 라이선스/배포 조건이 있을 수 있습니다. 반드시 최종 빌드 구성에 따라 검사합니다.

## 6. 오픈소스 공개 전 확인

- **소스 공개 가능성:** 현재 확인한 주요 npm/Windows Rust 직접 의존성 및 벤더 QR 코드는 MIT 프로젝트 배포와 양립하는 허용형 라이선스를 사용합니다. 이것이 **모든 Rust 간접 의존성, Android Gradle/NDK 의존성, 모든 이미지의 저작권을 최종 확인했다는 뜻은 아닙니다.**
- **로고·아이콘:** `apps/desktop/src-tauri/icons/`, `apps/android/src-tauri/icons/` 등 이미지의 원본 제작자·재배포 허가를 공개 전에 확인하세요.
- **보안:** 공개 전에 코드·Git 전체 기록의 키·토큰·계정 정보·개인 경로를 확인하세요. `.gitignore`는 앞으로의 파일을 막을 뿐 **기존 커밋에 포함된 비밀값을 삭제하지 않습니다.**
- **점검 기록:** [`docs/OPEN_SOURCE_RELEASE_CHECKLIST.md`](docs/OPEN_SOURCE_RELEASE_CHECKLIST.md)에서 공개 전 확인할 사항과 조사 한계를 추적합니다.

이 목록은 README에서 링크하며, 새 의존성 추가 또는 버전 갱신 시 함께 유지해야 합니다.
