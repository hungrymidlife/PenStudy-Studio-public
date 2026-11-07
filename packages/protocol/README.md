# PenStudy Wire Protocol v1

Local WebSocket, one authenticated phone connection at a time. Framed JSON messages.

1. Client sends `{"type":"hello","token":"<32 hex characters>"}` within 8 seconds.
2. Server replies `{"type":"auth-ok","width":1920,"height":1080}`.
3. Only after authentication, messages: `begin`, `move`, `end`, `clear`, `undo`, `save`.
4. `begin`/`move`: x,y in range 0..1; pressure 0..1. `begin` additionally color hex + width 1..30.

Token is regenerated on each server start and is never stored. WS is unencrypted: use trusted Wi-Fi only. For USB use `adb reverse tcp:39871 tcp:39871` and desktop loopback mode (127.0.0.1).

First release does **not** emulate a system HID digitizer/Windows Ink. S Pen strokes render in the app's desktop overlay only.
