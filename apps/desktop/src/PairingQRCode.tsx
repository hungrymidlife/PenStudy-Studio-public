import { useMemo } from 'react';
import { qrcodegen } from './vendor/qrcodegen';
import { encodePairing, type PairingInfo } from '../../../packages/protocol/pairing';

type Props = {info: PairingInfo};
export function PairingQRCode({info}:Props) {
  const result=useMemo(()=>{
    try {
      const value=encodePairing(info);
      const qr=qrcodegen.QrCode.encodeText(value,qrcodegen.QrCode.Ecc.MEDIUM);
      const padding=4,size=qr.size+padding*2;
      let path='';
      for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++){
        if(qr.getModule(x,y))path+=`M${x+padding},${y+padding}h1v1h-1z`;
      }
      return {size,path,error:''};
    }catch(e){return {size:0,path:'',error:String(e)};}
  },[info.host,info.mode,info.port,info.token]);
  if(result.error)return <p role="alert" className="microcopy">{result.error}</p>;
  return <div className="pairing-qr" aria-label="휴대폰에서 스캔할 페어링 QR 코드">
    <svg viewBox={`0 0 ${result.size} ${result.size}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PenStudy 로컬 페어링 QR" shapeRendering="crispEdges">
      <rect width={result.size} height={result.size} fill="white"/>
      <path d={result.path} fill="#000000"/>
    </svg>
  </div>;
}
