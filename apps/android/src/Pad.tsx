import {useCallback,useEffect,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowDown,ArrowUp,Camera,CheckCircle2,Eraser,Eye,EyeOff,FileDown,GripVertical,Layers3,Link2,Maximize2,Minimize2,Minus,MousePointer2,Move,Paintbrush,PenLine,Plus,Gauge,QrCode,RotateCcw,Settings2,Smartphone,Trash2,Undo2,Wifi,WifiOff,X} from 'lucide-react';
import {invoke,requestPermissions} from '@tauri-apps/api/core';
import {decodePairing} from '../../../packages/protocol/pairing';
import {clamp01,DEFAULT_PEN_STYLE,ERASER_MIN_WIDTH,ERASER_MAX_WIDTH,orientedPoint,pressureWidth,validStyle,
  type InkPoint,type InkTool,type PenStyle,type Rotation} from '../../../packages/protocol/ink';
import {BRUSH_OPTIONS,DEFAULT_PHOTOSHOP,WHITE_BACKGROUND,validBackgroundColor,
  type PhotoshopState,type BrushType} from '../../../packages/protocol/photoshop';
import {MobileLayerPreview} from './layerPreview';

type Packet={type:string;[key:string]:string|number|boolean|InkPoint[]};
const COLORS=['#4DBEFF','#FFFFFF','#FCA5A5','#FDE68A','#86EFAC','#C4B5FD','#000000','#FF7D36'];
function storedRotation():Rotation {
  try {
    const rotation=localStorage.getItem('penstudy.rotation.v1');
    return rotation==='left'||rotation==='right'?rotation:'auto';
  }catch{return 'auto';}
}
function stylusPressure(e:{pointerType:string;pressure:number}):number {
  // PointerEvent.pressure is the true device pressure for a pen (0..1).
  // Don't replace a valid 0 pressure with 0.5: that erased the lightest strokes.
  return e.pointerType==='pen'?clamp01(e.pressure):0.5;
}
export function Pad(){
  const [host,setHost]=useState(()=>localStorage.getItem('penstudy.host')||'192.168.0.2');
  const [token,setToken]=useState('');
  const [connected,setConnected]=useState(false);
  const [inputMode,setInputMode]=useState<'mouse'|'ink'>('mouse');
  const [inkTool,setInkTool]=useState<InkTool>('pen');
  const inkToolRef=useRef<InkTool>('pen');
  const [notice,setNotice]=useState('PC에서 서버를 시작한 뒤 연결하세요.');
  const [color,setColor]=useState(DEFAULT_PEN_STYLE.color);
  const [width,setWidth]=useState(DEFAULT_PEN_STYLE.width);
  const [pressureEnabled,setPressureEnabled]=useState(DEFAULT_PEN_STYLE.pressureEnabled);
  const [pressureSensitivity,setPressureSensitivity]=useState(DEFAULT_PEN_STYLE.pressureSensitivity);
  const styleRef=useRef<PenStyle>(DEFAULT_PEN_STYLE);
  const [pressureSample,setPressureSample]=useState<number|null>(null);
  const lastPressureUpdate=useRef(0);
  const lastHoverSent=useRef(0);
  const [penOnly,setPenOnly]=useState(true);
  const [backgroundColor,setBackgroundColor]=useState(()=>{
    const value=localStorage.getItem('penstudy.boardColor.v1');
    return validBackgroundColor(value)?value:WHITE_BACKGROUND;
  });
  const [photoshop,setPhotoshop]=useState<PhotoshopState>(DEFAULT_PHOTOSHOP);
  const photoshopRef=useRef<PhotoshopState>(DEFAULT_PHOTOSHOP);
  const preview=useRef(new MobileLayerPreview());
  const [showLayers,setShowLayers]=useState(false);
  const [monitor,setMonitor]=useState({width:1920,height:1080});
  const [rotation,setRotation]=useState<Rotation>(storedRotation);
  const ws=useRef<WebSocket|null>(null);
  const down=useRef(false);
  const activePointer=useRef<number|null>(null);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const last=useRef<{x:number;y:number}|null>(null);
  const [showSettings,setShowSettings]=useState(true);
  const [fullPad,setFullPad]=useState<boolean>(()=>{
    try{return localStorage.getItem('penstudy.fullPad.v1')!=='off';}catch{return true;}
  });
  const isFullPad=connected&&fullPad;
  const [scanning,setScanning]=useState(false);
  // Phone toolbar rails are individually movable within their own side slots.
  const [railOffsets,setRailOffsets]=useState<{left:number;right:number}>(()=>{
    const read=(side:'left'|'right')=>{
      const v=Number(localStorage.getItem('penstudy.rail.'+side+'.v1'));
      return Number.isFinite(v)?v:0;
    };
    return {left:read('left'),right:read('right')};
  });
  const railOffsetsRef=useRef(railOffsets);
  const railDrag=useRef<{side:'left'|'right';pointerId:number;start:number;origin:number;limit:number}|null>(null);

  // Native Android immersive mode hides the system navigation keys and status
  // bar only while the connected drawing canvas is maximized.
  useEffect(()=>{
    const sync=()=>{
      void invoke('set_immersive',{enabled:isFullPad}).catch(error=>{
        console.warn('PenStudy system-bar toggle unavailable:',error);
      });
    };
    sync();
    const onVisible=()=>{if(document.visibilityState==='visible')sync();};
    // Some Android versions restore system bars during orientation/recreation.
    const onRotate=()=>window.setTimeout(sync,160);
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('orientationchange',onRotate);
    return()=>{
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('orientationchange',onRotate);
    };
  },[isFullPad]);

  function applyPhotoshopState(state:PhotoshopState){
    photoshopRef.current=state;
    setPhotoshop(state);
    preview.current.updatePhotoshop(state);
  }
  function applyStyle(next:unknown) {
    if(!validStyle(next))return;
    styleRef.current=next;
    setColor(next.color);
    setWidth(next.width);
    setPressureEnabled(next.pressureEnabled);
    setPressureSensitivity(next.pressureSensitivity);
  }
  function changeStyle(patch:Partial<PenStyle>) {
    const next={...styleRef.current,...patch};
    if(!validStyle(next))return;
    applyStyle(next);
    if(ws.current?.readyState===WebSocket.OPEN&&connected)
      ws.current.send(JSON.stringify({type:'pen-style',style:next}));
  }
  function changeRotation(value:Rotation) {
    setRotation(value);
    try{localStorage.setItem('penstudy.rotation.v1',value);}catch{/* storage unavailable */}
  }
  function changeInputMode(value:'mouse'|'ink'){
    if(inputMode===value)return;
    // End an active drag before changing the meaning of subsequent packets.
    if(down.current){
      send({type:'end'});
      const pointer=activePointer.current;
      down.current=false;activePointer.current=null;last.current=null;
      const canvas=canvasRef.current;
      if(canvas&&pointer!==null&&canvas.hasPointerCapture(pointer)){
        canvas.releasePointerCapture(pointer);
      }
    }
    setInputMode(value);
    if(value==='mouse')preview.current.end();
    send({type:'input-mode',mode:value});
  }
  function changeInkTool(tool:InkTool){
    if(down.current){
      send({type:'end'});
      const id=activePointer.current;
      const canvas=canvasRef.current;
      down.current=false;activePointer.current=null;last.current=null;
      preview.current.end();
      if(canvas&&id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    }
    if(inputMode!=='ink'){
      setInputMode('ink');
      send({type:'input-mode',mode:'ink'});
    }
    inkToolRef.current=tool;
    setInkTool(tool);
    send({type:'ink-tool',tool});
  }
  function chooseBackground(value:string){
    if(!validBackgroundColor(value))return;
    setBackgroundColor(value);
    try{localStorage.setItem('penstudy.boardColor.v1',value);}catch{/* unavailable */}
  }
  function photoshopAction(action:string,extra:Record<string,string|boolean>={}){
    send({type:'photoshop',action,...extra});
  }
  function togglePhotoshop(){
    if(!photoshop.enabled&&inputMode!=='ink')changeInputMode('ink');
    photoshopAction('enable',{enabled:!photoshop.enabled});
  }
  function cycleBrush(){
    const index=BRUSH_OPTIONS.findIndex(x=>x.value===photoshop.brush);
    const brush=BRUSH_OPTIONS[(index+1)%BRUSH_OPTIONS.length].value;
    photoshopAction('brush',{brush});
  }
  function renameLayer(id:string,current:string){
    const name=window.prompt('레이어 이름 변경',current);
    if(name!==null)photoshopAction('rename',{id,name});
  }
  function beginRailDrag(side:'left'|'right',e:ReactPointerEvent<HTMLButtonElement>){
    if(e.button!==0)return;
    const rail=e.currentTarget.closest('aside');
    const parent=rail?.parentElement;
    if(!rail||!parent)return;
    e.preventDefault();e.stopPropagation();
    const portrait=window.matchMedia('(orientation:portrait)').matches;
    const room=Math.max(0,(portrait?
      parent.clientWidth-rail.clientWidth:parent.clientHeight-rail.clientHeight)/2);
    railDrag.current={side,pointerId:e.pointerId,
      start:portrait?e.clientX:e.clientY,
      origin:railOffsetsRef.current[side],limit:room};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveRailDrag(e:ReactPointerEvent<HTMLButtonElement>){
    const drag=railDrag.current;
    if(!drag||drag.pointerId!==e.pointerId)return;
    e.preventDefault();e.stopPropagation();
    const portrait=window.matchMedia('(orientation:portrait)').matches;
    const change=(portrait?e.clientX:e.clientY)-drag.start;
    const next=Math.max(-drag.limit,Math.min(drag.limit,drag.origin+change));
    railOffsetsRef.current={...railOffsetsRef.current,[drag.side]:next};
    setRailOffsets(railOffsetsRef.current);
  }
  function finishRailDrag(e:ReactPointerEvent<HTMLButtonElement>){
    const drag=railDrag.current;
    if(!drag||drag.pointerId!==e.pointerId)return;
    e.preventDefault();e.stopPropagation();
    railDrag.current=null;
    try{localStorage.setItem('penstudy.rail.'+drag.side+'.v1',
      String(railOffsetsRef.current[drag.side]));}catch{/* unavailable */}
    if(e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function resetRail(side:'left'|'right'){
    railOffsetsRef.current={...railOffsetsRef.current,[side]:0};
    setRailOffsets(railOffsetsRef.current);
    try{localStorage.setItem('penstudy.rail.'+side+'.v1','0');}catch{/* unavailable */}
  }
  function toggleFullPad(value:boolean) {
    setFullPad(value);
    try{localStorage.setItem('penstudy.fullPad.v1',value?'on':'off');}catch{/* storage unavailable */}
  }
  const send=useCallback((packet:Packet)=>{
    if(ws.current?.readyState!==WebSocket.OPEN||!connected)return;
    ws.current.send(JSON.stringify(packet));
  },[connected]);
  function connect(override?:{host:string;token:string}){
    const effectiveHost=override?.host??host;
    const effectiveToken=override?.token??token;
    const addr=effectiveHost.trim().replace(/^ws:\/\//,'').replace(/\/$/,'');
    if(!/^[a-zA-Z0-9.:-]+$/.test(addr)){setNotice('PC 주소는 IPv4 또는 127.0.0.1 형식으로 입력해 주세요.');return;}
    if(!/^[a-f0-9]{32}$/i.test(effectiveToken.trim())){setNotice('PC의 32자리 페어링 토큰을 입력해 주세요.');return;}
    ws.current?.close();
    const endpoint=`ws://${addr.includes(':')?addr:`${addr}:39871`}`;
    const connectionType=addr.startsWith('127.')?'USB(ADB reverse)':'Wi-Fi';
    setNotice(`PC 연결 시도 중: ${endpoint} · ${connectionType}`);
    const socket=new WebSocket(endpoint);ws.current=socket;
    let authenticated=false;
    let failureReason='';
    // A connected TCP socket that never sends auth-ok must not spin forever.
    const timeout=window.setTimeout(()=>{
      if(authenticated||ws.current!==socket||socket.readyState===WebSocket.CLOSED)return;
      failureReason=`PC 인증 응답이 없습니다(9초). ${endpoint} / ${connectionType} 서버 및 새 QR을 확인하세요.`;
      setNotice(failureReason);
      socket.close();
    },9000);
    socket.onopen=()=>socket.send(JSON.stringify({type:'hello',token:effectiveToken.trim()}));
    socket.onmessage=event=>{
      try {
        const response=JSON.parse(String(event.data));
        if(response.type==='auth-ok'){
          authenticated=true;
          window.clearTimeout(timeout);
          setMonitor({width:response.width||1920,height:response.height||1080});
          applyStyle(response.style);
          setInputMode(response.inputMode==='ink'?'ink':'mouse');
          const initialTool:InkTool=response.inkTool==='eraser'?'eraser':'pen';
          inkToolRef.current=initialTool;
          setInkTool(initialTool);
          if(response.photoshop)applyPhotoshopState(response.photoshop as PhotoshopState);
          preview.current.reset();
          setConnected(true);setShowSettings(false);
          localStorage.setItem('penstudy.host',effectiveHost.trim());
          setNotice('연결 완료 · S펜으로 Windows 마우스를 제어하거나 필기 모드를 선택하세요.');
        }else if(response.type==='pen-style')applyStyle(response.style);
        else if(response.type==='photoshop-state'){
          applyPhotoshopState(response.state as PhotoshopState);
        }
        else if(response.type==='photoshop-error'){
          setNotice('레이어 작업 실패: '+String(response.message));
        }
        else if(response.type==='ink-tool'){
          const nextTool:InkTool=response.tool==='eraser'?'eraser':'pen';
          // Do not stop an active stroke when the server merely echoes the
          // tool we already selected (the WebSocket handler captures old state).
          if(inkToolRef.current!==nextTool){
            if(down.current){
              socket.send(JSON.stringify({type:'end'}));
              down.current=false;activePointer.current=null;last.current=null;
            }
            inkToolRef.current=nextTool;
            setInkTool(nextTool);
          }
        }
        else if(response.type==='input-mode'){
          const next=response.mode==='ink'?'ink':'mouse';
          setInputMode(next);
          if(next==='mouse')preview.current.end();
        }
        else if(response.type==='action'){
          if(response.action==='clear')preview.current.clear();
          if(response.action==='undo')preview.current.undo();
        }else if(response.type==='auth-error'){
          failureReason='인증 토큰이 맞지 않습니다. PC에서 입력 서버를 재시작했다면 새 QR을 스캔하세요.';
          setNotice(failureReason);socket.close();
        }
        else if(response.type==='busy'){
          failureReason='다른 기기가 이미 연결되어 있습니다. 기존 연결을 해제하세요.';
          setNotice(failureReason);socket.close();
        }
      }catch{setNotice('잘못된 서버 응답입니다.');}
    };
    socket.onerror=()=>{
      failureReason=`연결 실패: ${endpoint}. PC 입력 서버의 바인딩 주소, Windows 방화벽, ${connectionType} 설정을 확인하세요.`;
      setNotice(failureReason);
    };
    socket.onclose=()=>{
      window.clearTimeout(timeout);
      if(ws.current!==socket)return;
      setConnected(false);setShowSettings(true);
      if(authenticated){
        setNotice('PC 입력 서버와 연결이 종료되었습니다. PC에서 서버를 시작하고 새 QR을 스캔하세요.');
      }else{
        setNotice(failureReason||`PC 서버에 연결하지 못했습니다: ${endpoint}. 새 QR과 ${connectionType} 설정을 확인하세요.`);
      }
    };
  }
  async function scanQr(){
    if(scanning)return;
    setScanning(true);setNotice('카메라로 PC의 페어링 QR을 스캔하세요.');
    try {
      const permission=await requestPermissions<{camera:string}>('barcode-scanner');
      if(permission.camera!=='granted'){
        setNotice('카메라 권한이 필요합니다. 휴대폰 앱 설정에서 카메라 권한을 허용하세요.');
        return;
      }
      const result=await invoke<{content:string}>('plugin:barcode-scanner|scan',{
        cameraDirection:'back',formats:['QR_CODE'],windowed:false
      });
      const paired=decodePairing(result.content);
      setHost(paired.host);setToken(paired.token);setShowSettings(false);
      setNotice(paired.mode==='usb'?'USB 페어링 확인 중… ADB reverse가 필요합니다.':'Wi-Fi 페어링 확인 중…');
      connect({host:paired.host,token:paired.token});
    }catch(e){
      const message=String(e);
      setNotice(/cancel|취소/i.test(message)?'QR 스캔을 취소했습니다.':`QR 페어링 실패: ${message}`);
    }finally{setScanning(false);}
  }
  function disconnect(){ws.current?.close();setConnected(false);setShowSettings(true);}
  useEffect(()=>()=>ws.current?.close(),[]);

  // Android will rotate the Activity with the device (fullSensor Manifest setting).
  // In auto mode we use the already-rotated CSS viewport coordinates directly.
  // A manual 90° correction is available if an Android ROM keeps the WebView portrait.
  function toPoint(e:{clientX:number;clientY:number;pressure:number;pointerType:string},box:DOMRect):InkPoint {
    const base={x:clamp01((e.clientX-box.left)/box.width),
      y:clamp01((e.clientY-box.top)/box.height),pressure:stylusPressure(e)};
    return orientedPoint(base,rotation);
  }
  function coords(e:ReactPointerEvent<HTMLCanvasElement>):InkPoint {
    return toPoint(e,e.currentTarget.getBoundingClientRect());
  }
  function isPen(e:ReactPointerEvent<HTMLCanvasElement>){return !penOnly||e.pointerType==='pen';}
  function reportPressure(e:{pressure:number;pointerType:string}){
    if(e.pointerType!=='pen')return;
    const now=performance.now();
    if(now-lastPressureUpdate.current>130){
      lastPressureUpdate.current=now;
      setPressureSample(stylusPressure(e));
    }
  }
  function drawPreview(e:{clientX:number;clientY:number;pressure:number;pointerType:string},start:boolean){
    const canvas=canvasRef.current;
    if(!canvas)return;
    const box=canvas.getBoundingClientRect();
    const point:InkPoint={
      x:clamp01((e.clientX-box.left)/box.width),
      y:clamp01((e.clientY-box.top)/box.height),
      pressure:stylusPressure(e)
    };
    if(start){
      const state=photoshopRef.current;
      const id=state.enabled?state.activeLayerId:'base';
      preview.current.begin(id,inkToolRef.current,state.brush,styleRef.current,point);
    }else{
      preview.current.point(point);
    }
  }
  // Samsung S Pen hover can emit pen pointermove events before it touches glass.
  // Forward a lightweight cursor position without starting a stroke.
  function hover(e:ReactPointerEvent<HTMLCanvasElement>){
    if(!connected||down.current||e.pointerType!=='pen')return;
    const now=performance.now();
    if(now-lastHoverSent.current<16)return;
    lastHoverSent.current=now;
    const p=coords(e);
    send({type:'hover',x:p.x,y:p.y});
  }
  function leaveHover(e:ReactPointerEvent<HTMLCanvasElement>){
    if(e.pointerType==='pen'&&!down.current)send({type:'hover-end'});
  }
  function begin(e:ReactPointerEvent<HTMLCanvasElement>){
    if(!connected||!isPen(e)||down.current)return;
    if(inputMode==='ink'&&photoshopRef.current.enabled &&
       !photoshopRef.current.layers.some(layer=>
         layer.id===photoshopRef.current.activeLayerId&&layer.visible)){
      setNotice('선택한 레이어가 숨김 상태입니다. 표시하거나 다른 레이어를 선택하세요.');
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    down.current=true;activePointer.current=e.pointerId;
    send({type:'begin',...coords(e)});
    if(inputMode==='ink')drawPreview(e.nativeEvent,true);
    reportPressure(e.nativeEvent);
  }
  function move(e:ReactPointerEvent<HTMLCanvasElement>){
    if(!down.current){hover(e);return;}
    if(e.pointerId!==activePointer.current)return;
    e.preventDefault();
    const samples=e.nativeEvent.getCoalescedEvents?.()??[];
    const batch=samples.length?samples:[e.nativeEvent];
    const box=e.currentTarget.getBoundingClientRect();
    // Keep legacy one-point packets when only one sample is available.
    // Batch high-frequency coalesced samples to avoid flooding WebView2.
    if(inputMode==='mouse'){
      // Only the latest cursor location matters in mouse mode.
      send({type:'move',...toPoint(batch[batch.length-1],box)});
      reportPressure(batch[batch.length-1]);
      return;
    }
    if(batch.length===1){
      send({type:'move',...toPoint(batch[0],box)});
    }else{
      for(let start=0;start<batch.length;start+=24){
        const chunk=batch.slice(start,start+24);
        send({type:'move-batch',points:chunk.map(point=>toPoint(point,box))});
      }
    }
    // Render all coalesced S Pen points to the active layer and composite
    // only once, retaining the low-latency drawing path on high-rate devices.
    preview.current.points(batch.map(sample=>({
      x:clamp01((sample.clientX-box.left)/box.width),
      y:clamp01((sample.clientY-box.top)/box.height),
      pressure:stylusPressure(sample)
    })));
    reportPressure(batch[batch.length-1]);
  }
  function end(e:ReactPointerEvent<HTMLCanvasElement>){
    if(!down.current||e.pointerId!==activePointer.current)return;
    e.preventDefault();
    down.current=false;activePointer.current=null;last.current=null;
    preview.current.end();
    send({type:'end'});
    if(e.pointerType==='pen'){
      const p=coords(e);send({type:'hover',x:p.x,y:p.y});
    }
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  // End a stroke before Android changes its viewport orientation, preventing
  // a long diagonal from old portrait coordinates into new landscape coordinates.
  useEffect(()=>{
    const finish=()=>{
      if(!down.current)return;
      down.current=false;activePointer.current=null;last.current=null;
      preview.current.end();
      if(ws.current?.readyState===WebSocket.OPEN)ws.current.send(JSON.stringify({type:'end'}));
    };
    window.addEventListener('orientationchange',finish);
    return()=>window.removeEventListener('orientationchange',finish);
  },[]);
  // Reconstruct individual raster layers on device rotation and resize.
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const resize=()=>preview.current.attach(canvas,monitor.width);
    const observer=new ResizeObserver(resize);
    observer.observe(canvas);resize();
    return()=>observer.disconnect();
  },[isFullPad,monitor.width]);
  function action(type:'save'|'clear'|'undo'){
    send({type});
    if(type==='clear'){
      preview.current.clear();
      setNotice(photoshopRef.current.enabled
        ?'선택한 레이어의 필기만 지웠습니다. 다른 레이어는 유지됩니다.'
        :'전체 필기를 지웠습니다.');
    }
    if(type==='save')setNotice('PC에 저장을 요청했습니다. 실제 저장 결과는 PC 창에서 확인하세요.');
    if(type==='undo'){
      preview.current.undo();
      setNotice('선택한 레이어의 마지막 필기·지우기 작업을 되돌렸습니다.');
    }
  }
  return <main className={'shell '+(isFullPad?'full-pad-mode':'')}>
    {!isFullPad&&<header className="top"><div className="appmark"><PenLine size={22}/></div><div><h1>PenStudy <span>Pad</span></h1><p>Galaxy S24 Ultra · S Pen</p></div><div className={'pill '+(connected?'connected':'')}><span className="dot"/>{connected?'연결됨':'연결 안 됨'}</div></header>}
    {!isFullPad&&<section className="connect">
      <div className="connect-title"><Wifi size={18}/><b>PC 연결</b><button className="textbtn" onClick={()=>setShowSettings(!showSettings)}><Settings2 size={16}/> 설정</button></div>
      {(showSettings||!connected)&&<div className="connect-form"><button type="button" className="primary" onClick={()=>void scanQr()} disabled={scanning}><QrCode size={18}/>{scanning?'QR 스캔 중…':'PC 페어링 QR 스캔'}</button>
        <p className="notice">Windows 앱의 기기 연결 화면에서 QR을 표시하세요. 수동 연결도 가능합니다.</p>
        <label>PC IPv4 주소 또는 127.0.0.1 (ADB)</label><input inputMode="url" placeholder="192.168.0.2" value={host} onChange={e=>setHost(e.target.value)}/>
        <label>PC에서 발급한 페어링 토큰</label><input placeholder="32자리 인증 토큰" autoCapitalize="none" spellCheck={false} value={token} onChange={e=>setToken(e.target.value)}/>
        <button className="primary" onClick={()=>connect()} disabled={connected}><Link2 size={17}/>PC와 연결하기</button></div>}
      {connected&&<button className="disconnect" onClick={disconnect}><WifiOff size={15}/>연결 종료</button>}
      <p className="notice">{notice}</p>
    </section>}
    <section className={'drawing '+(isFullPad?'full-pad-drawing':'')}>
      {!isFullPad&&<div className="sectiontitle"><span><Smartphone size={17}/> S펜 입력 패드</span><span className="pad-heading-actions"><span className="sub">{monitor.width} × {monitor.height}</span>
        <button type="button" className="fullpad-toggle" disabled={!connected} onClick={()=>toggleFullPad(true)} aria-pressed={false}><Maximize2 size={15}/> 전체화면 켜기</button></span></div>}
      {isFullPad&&<aside className="pad-side-tools pad-side-left" aria-label="PC 필기 명령"
        style={{'--rail-offset':railOffsets.left+'px'} as CSSProperties}>
        <button type="button" className="pad-rail-grip" aria-label="왼쪽 모바일 도구 이동"
          title="드래그하여 왼쪽 도구 이동 · 두 번 눌러 위치 초기화"
          onPointerDown={e=>beginRailDrag('left',e)} onPointerMove={moveRailDrag}
          onPointerUp={finishRailDrag} onPointerCancel={finishRailDrag}
          onDoubleClick={()=>resetRail('left')}><GripVertical size={18}/></button>
        <button type="button" className="fullpad-mode-toggle" onClick={()=>changeInputMode(inputMode==='mouse'?'ink':'mouse')}
          title={inputMode==='mouse'?'마우스 모드 · 눌러서 필기 모드로 전환':'필기 모드 · 눌러서 마우스 모드로 전환'}
          aria-label={inputMode==='mouse'?'필기 모드 전환':'마우스 모드 전환'}>
          {inputMode==='mouse'?<MousePointer2 size={19}/>:<PenLine size={19}/>}
        </button>
        <button type="button" className={inputMode==='ink'&&inkTool==='eraser'?'is-active':''}
          onClick={()=>changeInkTool(inkTool==='eraser'?'pen':'eraser')}
          aria-pressed={inputMode==='ink'&&inkTool==='eraser'} aria-label="S펜 지우개 전환"
          title={inkTool==='eraser'?'지우개 ON · 눌러서 펜으로 전환':'지우개 · 필기를 문질러 부분 지우기'}>
          <Eraser size={19}/>
        </button>
        <span className="side-tool-separator" aria-hidden="true"/>
        <button type="button" onClick={()=>action('undo')} title="마지막 필기 되돌리기" aria-label="되돌리기"><Undo2 size={19}/></button>
        <button type="button" onClick={()=>action('clear')}
          title={photoshop.enabled?'선택한 레이어만 지우기':'필기 전체 지우기'}
          aria-label={photoshop.enabled?'선택 레이어 지우기':'전체 지우기'}><RotateCcw size={19}/></button>
        <button type="button" onClick={()=>action('save')} title="PC 화면 PNG 저장" aria-label="화면 저장"><Camera size={19}/></button>
        <span className="side-tool-separator" aria-hidden="true"/>
        <button type="button" onClick={()=>send({type:'toolbar-focus',side:'left'})}
          aria-label="PC 왼쪽 툴바 선택" title="PC 왼쪽 툴바 앞으로 가져오기"><Move size={18}/></button>
        <button type="button" onClick={()=>send({type:'toolbar-reset',side:'left'})}
          aria-label="PC 왼쪽 툴바 초기화" title="PC 왼쪽 툴바 위치 초기화"><Maximize2 size={18}/></button>
      </aside>}
      <div className="padwrap" style={{backgroundColor,
        backgroundImage:'none',...(isFullPad?{}:{aspectRatio:`${monitor.width} / ${monitor.height}`})}}>
        <canvas ref={canvasRef} className="pad" onPointerDown={begin} onPointerMove={move} onPointerEnter={hover} onPointerLeave={leaveHover} onPointerUp={end} onPointerCancel={end}/>
        {!connected&&<div className="padmask"><PenLine size={36}/><b>PC 연결 대기 중</b><span>연결되면 S펜으로 여기에 필기하세요</span></div>}
      </div>
      {isFullPad&&<aside className="pad-side-tools pad-side-right" aria-label="PC 펜 설정과 오버레이 영역"
        style={{'--rail-offset':railOffsets.right+'px'} as CSSProperties}>
        <button type="button" className="pad-rail-grip" aria-label="오른쪽 모바일 도구 이동"
          title="드래그하여 오른쪽 도구 이동 · 두 번 눌러 위치 초기화"
          onPointerDown={e=>beginRailDrag('right',e)} onPointerMove={moveRailDrag}
          onPointerUp={finishRailDrag} onPointerCancel={finishRailDrag}
          onDoubleClick={()=>resetRail('right')}><GripVertical size={18}/></button>
        <label className="side-color" title="펜 색상 선택">
          <input type="color" aria-label="펜 색상 선택" value={color}
            onChange={e=>changeStyle({color:e.target.value})}/>
        </label>
        <button type="button" onClick={()=>changeStyle({width:Math.max(1,width-1)})}
          disabled={width<=1} aria-label="펜 얇게" title="펜 굵기 줄이기">
          <Minus size={18}/>
        </button>
        <span className="side-width" aria-label={`펜 굵기 ${width}픽셀`}>{width}</span>
        <button type="button" onClick={()=>changeStyle({width:Math.min(20,width+1)})}
          disabled={width>=20} aria-label="펜 굵게" title="펜 굵기 늘리기">
          <Plus size={18}/>
        </button>
        <button type="button" className={pressureEnabled?'is-active':''}
          onClick={()=>changeStyle({pressureEnabled:!pressureEnabled})}
          aria-pressed={pressureEnabled} aria-label="필압 사용 전환" title="S펜 필압 켜기/끄기">
          <Gauge size={19}/>
        </button>
        <span className="side-tool-separator" aria-hidden="true"/>
        <button type="button" onClick={()=>changeStyle({eraserWidth:Math.max(ERASER_MIN_WIDTH,
            styleRef.current.eraserWidth-16)})}
          aria-label="지우개 작게" title="지우개 크기 줄이기 (현재 레이어만 지움)">
          <Minus size={18}/>
        </button>
        <span className="side-width" aria-label={`지우개 굵기 ${styleRef.current.eraserWidth}픽셀`}>
          {styleRef.current.eraserWidth}
        </span>
        <button type="button" onClick={()=>changeStyle({eraserWidth:Math.min(ERASER_MAX_WIDTH,
            styleRef.current.eraserWidth+16)})}
          aria-label="지우개 크게" title="지우개 크기 늘리기 (최대 512px)">
          <Plus size={18}/>
        </button>
        <span className="side-tool-separator" aria-hidden="true"/>
        <label className="side-color" title="입력판 배경색">
          <input type="color" aria-label="모바일 입력판 배경색" value={backgroundColor}
            onChange={e=>chooseBackground(e.target.value)}/>
        </label>
        <button type="button" onClick={cycleBrush}
          aria-label="브러시 종류 전환"
          title={`브러시: ${BRUSH_OPTIONS.find(b=>b.value===photoshop.brush)?.label}`}>
          <Paintbrush size={19}/>
        </button>
        <button type="button" className={photoshop.enabled?'is-active':''}
          onClick={togglePhotoshop} aria-pressed={photoshop.enabled}
          aria-label="포토샵 모드 전환" title="포토샵 레이어 모드 켜기/끄기">
          <Layers3 size={19}/>
        </button>
        {photoshop.enabled&&<>
          <button type="button" onClick={()=>setShowLayers(v=>!v)}
            aria-label="레이어 패널 열기" title="레이어 추가, 선택, 숨김, 순서 변경">
            <Layers3 size={18}/>
          </button>
          <button type="button" onClick={()=>send({type:'psd'})}
            aria-label="레이어 PSD 저장" title="레이어를 보존한 Photoshop PSD 저장">
            <FileDown size={18}/>
          </button>
        </>}
        <span className="side-tool-separator" aria-hidden="true"/>
        <button type="button" onClick={()=>send({type:'toolbar-focus',side:'right'})}
          aria-label="PC 툴바 선택" title="PC 플로팅 툴바 선택 · 마우스 모드에서 손잡이를 드래그해 이동">
          <Move size={19}/>
        </button>
        <button type="button" onClick={()=>send({type:'toolbar-reset',side:'right'})}
          aria-label="PC 툴바 위치 초기화" title="PC 플로팅 툴바를 오른쪽 위로 복원">
          <Maximize2 size={19}/>
        </button>
        <button type="button" className="fullpad-exit" onClick={()=>toggleFullPad(false)}
          aria-label="입력 패드 전체화면 끄기" title="전체화면 끄기">
          <Minimize2 size={16}/>
        </button>
      </aside>}
      {photoshop.enabled&&showLayers&&<div className="photoshop-layer-panel" role="region" aria-label="레이어 관리">
        <div className="ps-layer-head"><b>Photoshop 레이어</b>
          <button type="button" onClick={()=>setShowLayers(false)} aria-label="레이어 패널 닫기"><X size={17}/></button>
        </div>
        <div className="ps-layer-list">
          {photoshop.layers.slice().reverse().map(layer=><div key={layer.id}
            className={'ps-layer-row '+(photoshop.activeLayerId===layer.id?'selected':'')}>
            <button type="button" className="ps-layer-name" onClick={()=>photoshopAction('select',{id:layer.id})}
              title="현재 필기 레이어 선택">{layer.name}</button>
            <button type="button" onClick={()=>photoshopAction(layer.visible?'hide':'show',{id:layer.id})}
              title="레이어 보이기/숨기기" aria-label="레이어 표시 전환">
              {layer.visible?<Eye size={15}/>:<EyeOff size={15}/>}
            </button>
            <button type="button" onClick={()=>renameLayer(layer.id,layer.name)}
              title="이름 변경" aria-label="레이어 이름 변경"><PenLine size={14}/></button>
            <button type="button" onClick={()=>photoshopAction('up',{id:layer.id})}
              title="앞으로 이동" aria-label="레이어 위로 이동"><ArrowUp size={14}/></button>
            <button type="button" onClick={()=>photoshopAction('down',{id:layer.id})}
              title="뒤로 이동" aria-label="레이어 아래로 이동"><ArrowDown size={14}/></button>
            <button type="button" onClick={()=>photoshopAction('delete',{id:layer.id})}
              disabled={photoshop.layers.length===1} title="레이어 삭제" aria-label="레이어 삭제">
              <Trash2 size={14}/></button>
          </div>)}
        </div>
        <button type="button" className="ps-layer-add" onClick={()=>photoshopAction('add')}>
          <Plus size={17}/> 새 레이어
        </button>
      </div>}
      {!isFullPad&&<p className="padtip"><CheckCircle2 size={14}/> {inputMode==='mouse'
        ?'마우스 모드: S펜으로 Windows 클릭·드래그를 제어합니다.'
        :inkTool==='eraser'?'지우개 모드: S펜으로 PC 필기를 문질러 부분 지우세요.'
        :'필기 모드: S펜으로 PC 오버레이에 필기합니다.'}</p>}
    </section>
    {!isFullPad&&<section className="tools">
      <div className="input-mode-choices" role="group" aria-label="S펜 입력 모드">
        <button type="button" className={inputMode==='mouse'?'selected':''}
          aria-pressed={inputMode==='mouse'} disabled={!connected}
          onClick={()=>changeInputMode('mouse')}><MousePointer2 size={16}/> PC 마우스</button>
        <button type="button" className={inputMode==='ink'?'selected':''}
          aria-pressed={inputMode==='ink'} disabled={!connected}
          onClick={()=>changeInputMode('ink')}><PenLine size={16}/> 필기</button>
      </div>
      <div className="ink-tool-picker" role="group" aria-label="펜 또는 지우개 선택">
        <button type="button" className={inputMode==='ink'&&inkTool==='pen'?'selected':''}
          aria-pressed={inputMode==='ink'&&inkTool==='pen'} onClick={()=>changeInkTool('pen')}
          disabled={!connected}><PenLine size={16}/> 펜</button>
        <button type="button" className={inputMode==='ink'&&inkTool==='eraser'?'selected':''}
          aria-pressed={inputMode==='ink'&&inkTool==='eraser'} onClick={()=>changeInkTool('eraser')}
          disabled={!connected}><Eraser size={16}/> 지우개</button>
      </div>
      <div className="ps-options-normal">
        <label>입력판 배경색 <input type="color" aria-label="모바일 입력판 배경색" value={backgroundColor}
          onChange={e=>chooseBackground(e.target.value)}/></label>
        <label>브러시 종류 <select value={photoshop.brush}
          onChange={e=>photoshopAction('brush',{brush:e.target.value as BrushType})}>
          {BRUSH_OPTIONS.map(b=><option key={b.value} value={b.value}>{b.label}</option>)}
        </select></label>
        <button type="button" className={photoshop.enabled?'selected':''}
          onClick={togglePhotoshop} aria-pressed={photoshop.enabled}>
          <Layers3 size={16}/> 포토샵 모드 {photoshop.enabled?'ON':'OFF'}
        </button>
        {photoshop.enabled&&<>
          <button type="button" onClick={()=>setShowLayers(v=>!v)}>레이어 관리</button>
          <button type="button" onClick={()=>send({type:'psd'})}><FileDown size={16}/> PSD 저장</button>
        </>}
      </div>
      <div className="sectiontitle"><span><PenLine size={16}/> PC와 동기화된 펜 도구</span><span className="sub">{width}px</span></div>
      <div className="palette">{COLORS.map(c=><button aria-label={`펜 색상 ${c}`} key={c} onClick={()=>changeStyle({color:c})} className={'color '+(color.toUpperCase()===c?'selected':'')} style={{backgroundColor:c}} />)}
        <input type="color" className="custom-pen-color" aria-label="커스텀 펜 색상" value={color} onChange={e=>changeStyle({color:e.target.value})}/>
      </div>
      <input aria-label="펜 두께" type="range" min="1" max="20" value={width} onChange={e=>changeStyle({width:Number(e.target.value)})}/>
      <label className="eraser-width-label">지우개 굵기 <b>{styleRef.current.eraserWidth}px</b></label>
      <input aria-label="지우개 굵기" type="range" min={ERASER_MIN_WIDTH}
        max={ERASER_MAX_WIDTH} step="4" value={styleRef.current.eraserWidth}
        onChange={e=>changeStyle({eraserWidth:Number(e.target.value)})}/>
      <p className="notice">지우개 최대 512px · 선택한 레이어에만 적용됩니다.</p>
      <label className="toggle"><input type="checkbox" checked={pressureEnabled} onChange={e=>changeStyle({pressureEnabled:e.target.checked})}/>필압 사용
        <span className="pressure-indicator">{pressureSample===null?'S펜 압력 대기':`현재 ${Math.round(pressureSample*100)}%`}</span></label>
      <label className="orientation-label">좌표 방향
        <select value={rotation} onChange={e=>changeRotation(e.target.value as Rotation)}>
          <option value="auto">자동 · 휴대폰 회전 따라가기</option>
          <option value="left">왼쪽 90° 보정 (화면 미회전 시)</option>
          <option value="right">오른쪽 90° 보정 (화면 미회전 시)</option>
        </select>
      </label>
      <p className="notice">기본은 자동입니다. 휴대폰을 가로로 뒀는데 화면이 세로로 고정되는 경우에만 90° 보정을 선택하세요.</p>
      <p className="notice">필압 강도: {pressureSensitivity.toFixed(1)} · PC 필기 설정에서 조절할 수 있습니다.</p>
      <label className="toggle"><input type="checkbox" checked={penOnly} onChange={e=>setPenOnly(e.target.checked)}/>S펜으로만 입력 (손바닥 터치 방지)</label>
      <div className="buttons"><button onClick={()=>action('undo')} disabled={!connected}><Undo2 size={17}/>되돌리기</button><button onClick={()=>action('clear')} disabled={!connected}><RotateCcw size={16}/>{photoshop.enabled?'현재 레이어 지우기':'전체 지우기'}</button><button className="save" onClick={()=>action('save')} disabled={!connected}><Camera size={19}/>PC 화면 저장</button></div>
    </section>}
    {!isFullPad&&<footer>PenStudy v0.1 · 가로 입력 모드 · S펜 호버 위치 표시 · 필압 연동</footer>}
  </main>;
}
