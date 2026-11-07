# 향후 구현 우선순위

## 0. 실기기 검증 및 오류 보정

1. Windows Rust/MSVC + WebView2 환경에서 `npm run desktop` 빌드 및 구동.
2. Tauri `android init`, Android SDK/NDK/JDK/ADB 환경을 구성한 후 S24 Ultra에서 `android dev`.
3. USB ADB reverse → Windows loopback 연결, 토큰 인증, 펜 입력, F9 PNG 저장 검증.
4. Wi-Fi 연결 → Windows 방화벽, 연결 재수립, 노출 범위 검증.
5. 125~200% 고 DPI 및 멀티 모니터 실기기 확인.

## 1. S펜 native 지원

- Kotlin Android `MotionEvent` 수집 플러그인: toolType, pressure, tilt, orientation, hover, historical points, stylus buttons.
- React 패드와 Kotlin bridge를 모두 지원하되 한 쪽을 선택하여 **중복 획 발생 방지**.
- 실제 Galaxy S24 Ultra 펜 측면 버튼이 앱에 전달되는지 검증. OS가 차단하면 화면 버튼/볼륨키/블루투스 리모컨 대안 제공.

## 2. 학습 워크플로

- 저장 성공/실패 ACK를 휴대폰으로 전송.
- 연속 저장 페이지 목록, 과목별 세션, 자동 PNG/PDF 집계.
- 선택 영역 저장, PDF 교재 위 필기, 형광펜/도형/텍스트/레이저 포인터.

## 3. 배포

- Android APK 서명/릴리스 파이프라인과 Windows NSIS 빌드.
- Windows 코드를 standalone service, overlay, UI 모듈로 분리.
- 런타임 업데이트 및 사용자 데이터 스키마 버전 관리.
