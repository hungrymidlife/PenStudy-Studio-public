/** PenStudy v1 QR pairing payload. Never send this URL to cloud QR generators. */
export const PAIRING_PORT = 39871;
export type PairingMode = 'usb' | 'wifi';
export type PairingInfo = { host: string; port: number; token: string; mode: PairingMode };

export function validIpv4(host: string): boolean {
  const parts = host.split('.');
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255 && String(Number(p)) === p);
}
export function isPrivateOrLoopbackIpv4(host: string): boolean {
  if (!validIpv4(host)) return false;
  const p = host.split('.').map(Number);
  return (p[0] === 10) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 127 && p[1] === 0 && p[2] === 0 && p[3] === 1);
}
export function encodePairing(info: PairingInfo): string {
  if (info.port !== PAIRING_PORT || !/^[a-f0-9]{32}$/i.test(info.token) || !isPrivateOrLoopbackIpv4(info.host))
    throw new Error('잘못된 페어링 주소 또는 토큰입니다.');
  if (info.mode === 'usb' && info.host !== '127.0.0.1') throw new Error('USB 주소는 127.0.0.1만 가능합니다.');
  if (info.mode === 'wifi' && info.host === '127.0.0.1') throw new Error('Wi-Fi 모드는 PC의 사설 IPv4를 사용하세요.');
  const query = new URLSearchParams({v:'1',mode:info.mode,host:info.host,port:String(info.port),token:info.token});
  return 'penstudy://pair?' + query.toString();
}
export function decodePairing(payload: string): PairingInfo {
  if (payload.length > 512) throw new Error('페어링 QR이 너무 깁니다.');
  let url: URL;
  try { url = new URL(payload.trim()); } catch { throw new Error('PenStudy 페어링 QR이 아닙니다.'); }
  if (url.protocol !== 'penstudy:' || url.hostname !== 'pair' || url.pathname !== '' ||
    url.username || url.password || url.port || url.hash || url.searchParams.get('v') !== '1')
    throw new Error('지원되지 않는 페어링 QR입니다.');
  const allowed = new Set(['v','mode','host','port','token']);
  if ([...url.searchParams.keys()].some(k => !allowed.has(k) || url.searchParams.getAll(k).length !== 1))
    throw new Error('페어링 QR의 매개변수가 올바르지 않습니다.');
  const mode = url.searchParams.get('mode');
  const host = url.searchParams.get('host') ?? '';
  const port = Number(url.searchParams.get('port'));
  const token = url.searchParams.get('token') ?? '';
  if ((mode !== 'usb' && mode !== 'wifi') || !isPrivateOrLoopbackIpv4(host) ||
      port !== PAIRING_PORT || !/^[a-f0-9]{32}$/i.test(token) ||
      (mode === 'usb' && host !== '127.0.0.1') ||
      (mode === 'wifi' && host === '127.0.0.1'))
    throw new Error('페어링 QR의 주소 또는 토큰이 유효하지 않습니다.');
  return { mode, host, port, token };
}
