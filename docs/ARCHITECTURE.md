# PenStudy Studio — 기술 아키텍처 (초안)

## 설계 의도

- 데스크톱과 모바일의 사용자 경험을 독립적으로 유지하는 **두 개의 Tauri 2 애플리케이션**.
- Windows 전용 Rust에서 **WebSocket 입력 서버 + 주 모니터 캡처**를 담당.
- Android WebView의 PointerEvent로 S펜의 위치/압력/포인터 종류를 우선 수집. 이후 Kotlin 플러그인으로 호버 및 버튼 상태를 고도화.
- React Canvas가 수신한 획을 투명 레이어에 렌더. 입력 클릭은 OS로 통과되므로 PC 조작 가능.

## 이벤트 흐름

```text
Galaxy S24 Ultra
  React Pad Canvas (pointerdown / pointermove / pointerup)
     | JSON: begin / move / end / save / undo / clear
     v
  WebSocket ws://PC:39871  -- token hello --> auth-ok
     | (trusted private LAN or ADB reverse)
     v
Windows Rust tokio-tungstenite listener (one authenticated writer)
     | Tauri emitter 'pen-packet', 'capture-requested'
     v
Tauri overlay Webview (click-through, 100% transparent)
     | React Canvas strokes / toDataURL('image/png')
     v
Rust save_capture:
   1. overlay.hide()
   2. wait compositor (~200ms)
   3. xcap primary monitor capture
   4. resize + alpha composite annotation PNG
   5. save PNG → Pictures/PenStudyCaptures
   6. overlay.show(), emit 'capture-saved'
```

## Feature-based modules

- Desktop View: `apps/desktop/src/App.tsx`, `settings.ts`
- Desktop overlay: `apps/desktop/src/overlay.tsx`
- Rust services: `apps/desktop/src-tauri/src/bridge.rs`, `lib.rs`
- Android View/Input: `apps/android/src/Pad.tsx`
- Wire format: `packages/protocol/README.md`
- Future: `crates/pen-protocol`, `plugins/tauri-plugin-spen`, `plugins/tauri-plugin-virtual-hid` (not included in MVP)

## 모니터 및 DPI

Overlay는 실행 시 주 모니터의 **실제 모니터 좌표/픽셀 크기**에 맞춰 배치. 캡처는 xcap의 primary monitor를 사용. React Canvas PNG는 devicePixelRatio로 생성하고 캡처 크기와 다르면 Rust에서 조정함. 멀티 모니터·DPI/스케일 변경 중 동적 동기화는 후속 개선 대상.

## 저장 경로

- 초기 기본: Rust `dirs::picture_dir()` / `PenStudyCaptures`
- 변경: Windows 설정 GUI (폴더 선택 다이얼로그)
- 파일명: `PenStudy_YYYYMMDD_HHMMSS_mmm.png`

## 추후 확장

1. S펜 버튼의 native Android MotionEvent/KeyEvent 수신 및 개인화 동작
2. 압력 커브, 도형 펜, 지우개, Android UI/PC UI 설정 양방향 동기화
3. 다중 모니터 선택 및 좌표 정확도 향상
4. 저지연(프레임 배치) 포인터 데이터 전송
5. PDF/학습노트, OCR 등의 선택 기능
6. 외부 필기 앱을 위한 Windows Ink/가상 HID는 별도 트랙
