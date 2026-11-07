import {useEffect,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {emit,listen} from '@tauri-apps/api/event';
import {open} from '@tauri-apps/plugin-dialog';
import {Activity,ArrowDown,ArrowRight,ArrowUp,BookOpen,Camera,CheckCircle2,Copy,Eraser,Eye,EyeOff,FileDown,FolderOpen,Home,Keyboard,Layers3,Link2,Monitor,Moon,Paintbrush,PenLine,Plus,RefreshCcw,Settings2,ShieldCheck,Smartphone,Sun,Trash2,Undo2,Wifi,XCircle} from 'lucide-react';
import {ColorPicker} from './ColorPicker';
import {PairingQRCode} from './PairingQRCode';
import {isPrivateOrLoopbackIpv4} from '../../../packages/protocol/pairing';
import {loadSettings,storeSettings,type PenSettings} from './settings';
import {ERASER_MAX_WIDTH,ERASER_MIN_WIDTH,type PenStyle,type InkTool} from '../../../packages/protocol/ink';
import {BRUSH_OPTIONS,DEFAULT_PHOTOSHOP,type PhotoshopState,type BrushType} from '../../../packages/protocol/photoshop';
import {captureHotkey,DEFAULT_HOTKEYS,loadHotkeys,storeHotkeys,type HotkeyAction,type HotkeyBindings} from './hotkeys';

type BridgeInfo={running:boolean;lan:boolean;port:number;token:string};
type CaptureRegion={x:number;y:number;width:number;height:number};
const initial:BridgeInfo={running:false,lan:false,port:39871,token:''};
const sections=[
  {id:'home',name:'홈',description:'빠른 시작 및 연결 상태',icon:Home},
  {id:'connection',name:'기기 연결',description:'USB · Wi-Fi · 페어링',icon:Link2},
  {id:'ink',name:'필기 설정',description:'펜 · 지우개 · 색상 · 압력',icon:PenLine},
  {id:'save',name:'저장 설정',description:'PNG 저장 및 관리',icon:Camera},
  {id:'appearance',name:'환경설정',description:'테마 · 단축키 설정',icon:Settings2},
  {id:'help',name:'도움말',description:'연결 방법 및 단축키',icon:BookOpen}
] as const;
type Section=typeof sections[number]['id'];
type Theme='dark'|'light';
const THEME_KEY='penstudy.theme.v1';
function initialTheme():Theme{
  try{return localStorage.getItem(THEME_KEY)==='light'?'light':'dark';}catch{return 'dark';}
}
function initialHost():string{
  try{return localStorage.getItem('penstudy.lanHost.v1')??'';}catch{return '';}
}
const LAN_KEY='penstudy.lanMode.v1';
function initialLanMode():boolean{
  try{return localStorage.getItem(LAN_KEY)==='wifi';}catch{return false;}
}
export function App(){
  const [section,setSection]=useState<Section>('home');
  const [theme,setTheme]=useState<Theme>(initialTheme);
  const [bridge,setBridge]=useState<BridgeInfo>(initial);
  // Preserve the selected transport on app restart. Otherwise a Wi-Fi user
  // silently starts a loopback-only (USB) server and the phone cannot reach it.
  const [lan,setLan]=useState(initialLanMode);
  const [host,setHost]=useState(initialHost);
  const [phone,setPhone]=useState(false);
  const [connectionDetail,setConnectionDetail]=useState('');
  const [settings,setSettings]=useState<PenSettings>(loadSettings);
  const [inkTool,setInkTool]=useState<InkTool>('pen');
  const [photoshop,setPhotoshop]=useState<PhotoshopState>(DEFAULT_PHOTOSHOP);
  const [hotkeys,setHotkeys]=useState<HotkeyBindings>(loadHotkeys);
  const [hotkeyBusy,setHotkeyBusy]=useState(false);
  const [activeDrawingApp,setActiveDrawingApp]=useState<string|null>(null);
  const [hotkeyError,setHotkeyError]=useState('');
  const [hotkeyNotice,setHotkeyNotice]=useState('');
  const [last,setLast]=useState('');
  const [fixedRegion,setFixedRegion]=useState<CaptureRegion|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [showToken,setShowToken]=useState(false);
  useEffect(()=>{
    invoke<string>('suggest_lan_ip').then(ip=>setHost(previous=>previous.trim()?previous:ip))
      .catch(()=>{/* Manual IPv4 entry remains available. */});
  },[]);
  useEffect(()=>{
    try{localStorage.setItem(LAN_KEY,lan?'wifi':'usb');}catch{/* Storage unavailable */}
  },[lan]);
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem(THEME_KEY,theme);}catch{/* Storage unavailable */}
  },[theme]);
  useEffect(()=>{
    // Populate Rust buses from the saved desktop preferences on startup.
    void emit('settings-updated',loadSettings()).catch(e=>setError(String(e)));
    void invoke('set_auto_canvas_routing',{enabled:loadSettings().autoCanvasRouting})
      .catch(e=>setError('캔버스 자동 연결 설정 실패: '+String(e)));
    void invoke<InkTool>('get_ink_tool').then(setInkTool).catch(e=>setError(String(e)));
    void invoke<PhotoshopState>('get_photoshop').then(setPhotoshop).catch(e=>setError(String(e)));
    void invoke<CaptureRegion|null>('get_fixed_capture_region')
      .then(setFixedRegion).catch(e=>setError('고정 영역 조회 실패: '+String(e)));
    void invoke('set_hotkeys',{bindings:loadHotkeys()})
      .catch(e=>setHotkeyError('기존 단축키 등록 실패: '+String(e)));
    invoke<BridgeInfo>('bridge_status').then(info=>{setBridge(info);if(info.running)setLan(info.lan);}).catch(e=>setError(String(e)));
    const cleanup: Array<()=>void> = [];let alive=true;
    void Promise.all([
      listen<BridgeInfo>('bridge-status',e=>setBridge(e.payload)),
      listen<boolean>('phone-connected',e=>setPhone(e.payload)),
      listen<string>('bridge-connection-detail',e=>setConnectionDetail(e.payload)),
      listen<InkTool>('ink-tool-changed',e=>setInkTool(e.payload)),
      listen<PhotoshopState>('photoshop-state-changed',e=>setPhotoshop(e.payload)),
      listen<HotkeyBindings>('hotkeys-updated',e=>setHotkeys(e.payload)),
      listen<boolean>('auto-canvas-routing-changed',e=>{
        setSettings(previous=>{
          const next={...previous,autoCanvasRouting:e.payload};
          storeSettings(next);
          return next;
        });
      }),
      listen<PenStyle>('pen-style-changed',e=>{
        setSettings(previous=>{
          const next={...previous,...e.payload};
          storeSettings(next);
          return next;
        });
      }),
      listen<CaptureRegion|null>('fixed-capture-region-updated',e=>{setFixedRegion(e.payload);setError('');}),
      listen<{path:string}>('capture-saved',e=>{setLast(e.payload.path);setError('');}),
      listen<{error:string}>('capture-failed',e=>setError(e.payload.error))
    ]).then(items=>{if(alive)cleanup.push(...items);else items.forEach(fn=>fn());}).catch(e=>setError(String(e)));
    return()=>{alive=false;cleanup.forEach(fn=>fn());};
  },[]);
  async function setOption<K extends keyof PenSettings>(key:K,value:PenSettings[K]){
    const next={...settings,[key]:value};
    setSettings(next);storeSettings(next);
    try{
      if(key==='autoCanvasRouting'){
        await invoke('set_auto_canvas_routing',{enabled:value});
      }else{
        await emit('settings-updated',next);
      }
    }catch(e){setError(String(e));}
  }
  useEffect(()=>{
    let live=true;
    const refresh=()=>{
      void invoke<string|null>('get_active_drawing_app')
        .then(app=>{if(live)setActiveDrawingApp(app);})
        .catch(()=>{if(live)setActiveDrawingApp(null);});
    };
    refresh();
    const timer=window.setInterval(refresh,1500);
    return()=>{live=false;window.clearInterval(timer);};
  },[]);
  async function chooseInkTool(tool:InkTool){
    try{
      await invoke('set_input_mode',{mode:'ink'});
      await invoke('set_ink_tool',{tool});
      setInkTool(tool);setError('');
    }catch(e){setError('펜 도구 변경 실패: '+String(e));}
  }
  async function editPhotoshop(action:string,extra:Record<string,string|boolean>={}){
    try{
      const next=await invoke<PhotoshopState>('edit_photoshop',{action,...extra});
      setPhotoshop(next);setError('');
    }catch(e){setError('포토샵 레이어 작업 실패: '+String(e));}
  }
  function renamePhotoshopLayer(id:string,current:string){
    const name=window.prompt('레이어 이름 변경',current);
    if(name!==null)void editPhotoshop('rename',{id,name});
  }
  async function applyHotkeyBindings(bindings:HotkeyBindings){
    setHotkeyBusy(true);setHotkeyError('');setHotkeyNotice('');
    try{
      await invoke('set_hotkeys',{bindings});
      storeHotkeys(bindings);
      setHotkeys(bindings);
      setHotkeyNotice('단축키가 저장되었고 즉시 적용되었습니다.');
    }catch(e){setHotkeyError('단축키를 적용하지 못했습니다: '+String(e));}
    finally{setHotkeyBusy(false);}
  }
  function captureKey(action:HotkeyAction,e:ReactKeyboardEvent<HTMLInputElement>){
    e.preventDefault();e.stopPropagation();
    if(e.key==='Escape'){e.currentTarget.blur();return;}
    if(hotkeyBusy)return;
    const combo=captureHotkey(e);
    if(!combo){setHotkeyError('F1~F12 또는 Ctrl/Alt + 영문·숫자 키를 눌러 주세요.');return;}
    if((Object.keys(hotkeys) as HotkeyAction[]).some(key=>key!==action&&hotkeys[key]===combo)){
      setHotkeyError('다른 기능에 이미 지정된 단축키입니다.');return;
    }
    const next={...hotkeys,[action]:combo};
    e.currentTarget.blur();
    // Let Windows release capture-only mode before registering the new key.
    void (async()=>{
      try{
        await invoke('set_hotkey_capture_mode',{active:false});
        await applyHotkeyBindings(next);
      }catch(error){setHotkeyError('단축키 캡처 종료 실패: '+String(error));}
    })();
  }
  async function toggleServer(){
    setBusy(true);setError('');setConnectionDetail('');
    try{
      if(bridge.running){
        await invoke('stop_bridge');setBridge(initial);setPhone(false);
        setConnectionDetail('서버를 종료했습니다. 다시 시작하면 새로운 QR과 토큰이 발급됩니다.');
      }else{
        const info=await invoke<BridgeInfo>('start_bridge',{lan});
        setBridge(info);
        setConnectionDetail(info.lan
          ?'Wi-Fi 서버가 0.0.0.0:39871에서 대기 중입니다. 휴대폰에서 아래의 PC IPv4 주소로 연결하세요.'
          :'USB 서버가 127.0.0.1:39871에서 대기 중입니다. ADB reverse가 필요합니다.');
      }
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function action(name:'save'|'region'|'fixed'|'configure-region'|'psd'|'undo'|'clear'){
    try{setError('');await invoke('request_action',{action:name});}
    catch(e){setError(String(e));}
  }
  async function clearFixedRegion(){
    try{await invoke('clear_fixed_capture_region');setFixedRegion(null);setError('');}
    catch(error){setError('고정 영역 해제 실패: '+String(error));}
  }
  async function chooseFolder(){
    try{const folder=await open({directory:true,multiple:false,title:'PNG 저장 폴더 선택'});if(typeof folder==='string')void setOption('outputFolder',folder);}
    catch(e){setError(String(e));}
  }
  async function copy(value:string){
    if(!value){setError('복사할 값이 없습니다.');return;}
    try{await navigator.clipboard.writeText(value);}catch{setError('클립보드 복사 실패: 직접 선택해 복사하세요.');}
  }
  function changeHost(value:string){setHost(value);try{localStorage.setItem('penstudy.lanHost.v1',value);}catch{/* Storage unavailable */}}
  async function refreshLanHost(){
    try{
      const ipv4=await invoke<string>('suggest_lan_ip');
      changeHost(ipv4);setError('');
    }catch(e){setError('PC IPv4 자동 검색 실패: '+String(e));}
  }
  const active=sections.find(s=>s.id===section)!;
  const hostAddress=host.trim();
  const address=lan?(hostAddress?`ws://${hostAddress}:39871`:''):'ws://127.0.0.1:39871';
  const qrHost = bridge.lan ? hostAddress : '127.0.0.1';
  const qrAllowed = bridge.running && Boolean(bridge.token) && isPrivateOrLoopbackIpv4(qrHost) &&
    (!bridge.lan || qrHost !== '127.0.0.1');
  const statusLabel=phone?'S펜 연결됨':bridge.running?'연결 대기 중':'서버 중지';
  const statusClass=phone?'online':bridge.running?'waiting':'offline';
  const serverButton=<button className={'primary-button '+(bridge.running?'danger-button':'')} disabled={busy} onClick={()=>void toggleServer()}>
    {bridge.running?<><XCircle size={18}/> 입력 서버 중지</>:<><Wifi size={18}/> 입력 서버 시작</>}
  </button>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><PenLine size={22}/></div><div className="brand-copy"><b>PenStudy <span>Studio</span></b><small>Desktop v0.1</small></div></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav aria-label="주요 메뉴" className="side-nav">{sections.map(item=>{const Icon=item.icon;return <button type="button" key={item.id} aria-current={section===item.id?'page':undefined}
        className={'nav-item '+(section===item.id?'active':'')} onClick={()=>setSection(item.id)}>
        <Icon size={18}/><span>{item.name}</span>{section===item.id&&<span className="nav-indicator"/>}
      </button>;})}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-device"><span className={'status-dot '+statusClass}/><div><b>{statusLabel}</b><small>Galaxy S24 Ultra</small></div></div>
        <div className="sidebar-theme"><button className={theme==='light'?'selected':''} onClick={()=>setTheme('light')} title="화이트 모드"><Sun size={17}/> Light</button><button className={theme==='dark'?'selected':''} onClick={()=>setTheme('dark')} title="다크 모드"><Moon size={17}/> Dark</button></div>
      </div>
    </aside>

    <main className="main-content">
      <header className="top-header"><div><div className="crumb">PENSTUDY / {active.name.toUpperCase()}</div><h1>{active.name}</h1><p>{active.description}</p></div>
        <button className="icon-button theme-quick" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} title={theme==='dark'?'화이트 모드':'다크 모드'} aria-label="테마 전환">{theme==='dark'?<Sun size={19}/>:<Moon size={19}/>}</button>
      </header>
      <div className="page-content">
        {section==='home'&&<div className="content-grid">
          <section className="surface hero-card span-all">
            <div className="section-head"><span className="overline">QUICK START</span><span className={'status-tag '+statusClass}><span className="status-dot"/>{statusLabel}</span></div>
            <h2>PC 화면에 바로 필기하세요.</h2>
            <p className="muted">스마트폰의 S펜 입력을 Windows 오버레이에 연결하고 필요할 때 한 번에 저장할 수 있어요.</p>
            <div className="hero-actions">{serverButton}<button className="secondary-button" onClick={()=>setSection('connection')}>연결 설정 <ArrowRight size={17}/></button></div>
          </section>
          <section className="surface">
            <div className="surface-title"><Monitor size={18}/><h3>연결 상태</h3></div>
            <div className="device-flow"><div><Monitor size={26}/><b>Windows</b><small>필기 오버레이</small></div><span className={'flow-line '+(phone?'connected':'')}><Link2 size={21}/></span><div><Smartphone size={26}/><b>Galaxy S24 Ultra</b><small>{phone?'입력 가능':'연결 대기'}</small></div></div>
            <button className="text-button" onClick={()=>setSection('connection')}>페어링 정보 보기 <ArrowRight size={15}/></button>
          </section>
          <section className="surface">
            <div className="surface-title"><Camera size={18}/><h3>빠른 화면 저장</h3></div>
            <button className="secondary-button fill-button" onClick={()=>void action('save')}><Camera size={18}/> 현재 화면 PNG 저장 <kbd>{hotkeys.save}</kbd></button>
            <div className="quick-actions">
              <button onClick={()=>void action('region')}><Camera size={16}/> 드래그 영역 캡처 <kbd>{hotkeys.region}</kbd></button>
              <button onClick={()=>void action('fixed')}><Camera size={16}/> 지정 영역 캡처 <kbd>{hotkeys.fixed}</kbd></button>
            </div>
            <div className="quick-actions"><button onClick={()=>void action('undo')}><Undo2 size={16}/> 되돌리기 <kbd>{hotkeys.undo}</kbd></button><button onClick={()=>void action('clear')}><RefreshCcw size={16}/> 전체 지우기 <kbd>{hotkeys.clear}</kbd></button></div>
            <div className="small-note">{last?<><CheckCircle2 size={15}/> 마지막 저장: <span className="wrap-text">{last}</span></>:<>저장 위치는 '저장 설정'에서 변경할 수 있어요.</>}</div>
          </section>
        </div>}

        {section==='connection'&&<div className="content-column">
          <section className="surface">
            <div className="surface-title"><Wifi size={19}/><h3>기기 연결 및 서버</h3><span className={'status-tag '+statusClass}>{statusLabel}</span></div>
            <div className="field-title">연결 방식</div>
            <div className="segment-control"><button className={!lan?'selected':''} disabled={bridge.running} onClick={()=>setLan(false)}>USB · ADB reverse</button><button className={lan?'selected':''} disabled={bridge.running} onClick={()=>setLan(true)}>같은 Wi-Fi</button></div>
            <p className="microcopy">{lan?'개인 Wi-Fi에서만 연결하세요. 서버가 LAN에 열리며 Windows 방화벽 허용이 필요할 수 있어요.':'기본값: PC 내부에서만 대기합니다. USB 모드에서 Android는 ADB reverse 설정이 필요합니다.'}</p>
            {lan&&<div className="field"><label htmlFor="wifi-host">PC의 IPv4 주소 (휴대폰과 같은 Wi-Fi/네트워크)</label>
              <div className="copy-row"><input id="wifi-host" value={host} onChange={e=>changeHost(e.target.value)}
                placeholder="예: 192.168.0.20"/><button type="button" onClick={()=>void refreshLanHost()}
                title="현재 PC IPv4 주소 다시 검색"><RefreshCcw size={16}/></button></div>
              <small>재접속이 안 되면 IP를 새로 검색해 보세요. QR에 표시되는 주소가 실제 PC IPv4여야 합니다.</small>
            </div>}
            <div className="connection-start">{serverButton}</div>
            {bridge.running&&<p className="microcopy">실제 서버 바인딩: <code>{bridge.lan?'0.0.0.0:39871 (Wi-Fi)':'127.0.0.1:39871 (USB)'}</code></p>}
            {connectionDetail&&<p className="microcopy" role="status">최근 연결 상태: {connectionDetail}</p>}
            {bridge.running&&!bridge.lan&&<p className="microcopy">USB 연결은 PowerShell에서 <code>adb reverse tcp:39871 tcp:39871</code> 실행 후, 새 QR을 스캔하세요. Wi-Fi로 쓰려면 서버 중지 → 같은 Wi-Fi 선택 → 다시 시작하세요.</p>}
          </section>
          <section className="surface">
            <div className="surface-title"><ShieldCheck size={18}/><h3>페어링 정보</h3></div>
            <div className="field"><label>연결 주소</label><div className="copy-row"><code>{address||'Wi-Fi 주소를 입력하세요'}</code><button title="주소 복사" disabled={!address} onClick={()=>void copy(address)}><Copy size={16}/></button></div></div>
            <div className="field"><label>세션 인증 토큰</label><div className="copy-row"><code>{!bridge.token?'서버 시작 후 생성됩니다':showToken?bridge.token:'•'.repeat(24)}</code><div className="row compact"><button onClick={()=>setShowToken(v=>!v)} disabled={!bridge.token}>{showToken?'숨기기':'표시'}</button><button title="토큰 복사" disabled={!bridge.token} onClick={()=>void copy(bridge.token)}><Copy size={16}/></button></div></div></div>
            <p className="microcopy">토큰은 서버를 다시 시작하면 새로 생성됩니다. 외부에 공유하지 마세요.</p>
            <div className="qr-section">
              <div className="field-title">QR로 빠른 페어링</div>
              {qrAllowed
                ? <><PairingQRCode info={{host:qrHost,port:bridge.port,token:bridge.token,mode:bridge.lan?'wifi':'usb'}}/>
                    <p className="microcopy">S24 Ultra의 PenStudy Pad에서 QR 스캔을 누르세요. 세션 주소와 토큰이 자동 입력됩니다.</p></>
                : <p className="microcopy">{!bridge.running?'입력 서버를 시작하면 페어링 QR을 표시합니다.':'QR을 표시하려면 올바른 PC 사설 IPv4 주소를 입력하세요.'}</p>}
              <p className="microcopy">QR에는 비밀 세션 토큰이 포함됩니다. 사진으로 공유하지 마세요. Wi-Fi에서는 동일한 사설 네트워크에서만 사용하세요.</p>
            </div>
          </section>
        </div>}

        {section==='ink'&&<div className="content-column">
          <section className="surface"><div className="surface-title"><PenLine size={18}/><h3>필기 도구</h3></div>
            <div className="ink-tool-picker" role="group" aria-label="실시간 필기 도구 선택">
              <button type="button" className={inkTool==='pen'?'selected':''} aria-pressed={inkTool==='pen'}
                onClick={()=>void chooseInkTool('pen')}><PenLine size={17}/> 펜</button>
              <button type="button" className={inkTool==='eraser'?'selected':''} aria-pressed={inkTool==='eraser'}
                onClick={()=>void chooseInkTool('eraser')}><Eraser size={17}/> 지우개</button>
            </div>
            <p className="microcopy">그리기와 지우개는 현재 선택한 레이어에만 적용돼요. 전체 지우기와 되돌리기도 포토샵 모드에서는 선택한 레이어에만 적용됩니다.</p>
            <ColorPicker value={settings.color} onChange={value=>void setOption('color',value)}/>
            <div className="field"><label className="label-between" htmlFor="pen-width">펜 두께 <b>{settings.width}px</b></label>
              <input id="pen-width" className="width-slider" type="range" min="1" max="20" step="1" value={settings.width} onChange={e=>void setOption('width',Number(e.target.value))}/>
              <div className="width-preview"><span style={{height:settings.width,width:Math.max(6,settings.width)}}/></div>
            </div>
            <div className="field">
              <label className="label-between" htmlFor="eraser-width">
                지우개 굵기 (펜 굵기와 독립) <b>{settings.eraserWidth}px</b>
              </label>
              <input id="eraser-width" className="width-slider" type="range"
                min={ERASER_MIN_WIDTH} max={ERASER_MAX_WIDTH} step="4"
                value={settings.eraserWidth}
                onChange={e=>void setOption('eraserWidth',Number(e.target.value))}/>
              <input type="number" min={ERASER_MIN_WIDTH} max={ERASER_MAX_WIDTH}
                value={settings.eraserWidth} aria-label="지우개 크기 직접 입력"
                onChange={e=>{
                  const parsed=Number(e.target.value);
                  if(Number.isFinite(parsed)&&parsed>=ERASER_MIN_WIDTH&&parsed<=ERASER_MAX_WIDTH)
                    void setOption('eraserWidth',parsed);
                }}/>
              <small>4~512px. 포토샵 모드에서는 현재 선택한 레이어에만 지우개가 적용됩니다.</small>
            </div>
            <label className="switch-row"><input type="checkbox" checked={settings.pressureEnabled} onChange={e=>void setOption('pressureEnabled',e.target.checked)}/>
              <span><b>S펜 필압 사용</b><small>누르는 압력에 따라 선이 굵거나 가늘어집니다.</small></span></label>
            <div className="field"><label className="label-between" htmlFor="pen-pressure">필압 강도 <b>{settings.pressureSensitivity.toFixed(1)}</b></label>
              <input id="pen-pressure" className="width-slider" type="range" min="0.5" max="3" step="0.1" disabled={!settings.pressureEnabled}
                value={settings.pressureSensitivity} onChange={e=>void setOption('pressureSensitivity',Number(e.target.value))}/>
              <small>기본 1.4 · 큰 값일수록 가벼운 필기와 강한 필기의 차이가 커집니다. 모바일과 자동 동기화됩니다.</small>
            </div>
          </section>
          <section className="surface">
            <div className="surface-title"><Monitor size={18}/><h3>그림 프로그램 자동 캔버스 연결</h3></div>
            <label className="switch-row"><input type="checkbox" checked={settings.autoCanvasRouting}
              onChange={e=>void setOption('autoCanvasRouting',e.target.checked)}/>
              <span><b>활성화된 그림 프로그램에 S펜 입력 전달</b>
              <small>Photoshop·그림판·Krita·Paint.NET·Clip Studio Paint·SAI가 활성 창일 때만 자동 전달합니다.</small></span>
            </label>
            <p className="microcopy">{activeDrawingApp
              ?`인식된 활성 프로그램: ${activeDrawingApp} · ${settings.autoCanvasRouting?'자동 연결 사용 중':'자동 연결 꺼짐'}`
              :'현재 인식된 그림 프로그램이 없습니다. 다른 창으로 이동해 사용하면 자동으로 확인합니다.'}</p>
            <p className="microcopy">그림 프로그램에서 브러시/지우개 도구를 직접 선택하고 S펜을 사용하세요. Windows 마우스 이벤트를 전달하므로 해당 앱의 캔버스 위에서만 그려지며, 네이티브 S펜 필압은 전달되지 않습니다. 미지원 프로그램은 PenStudy 오버레이로 그려집니다. 단축키 또는 이 옵션으로 자동 연결을 끌 수 있습니다.</p>
          </section>
          <section className="surface">
            <div className="surface-title"><Layers3 size={18}/><h3>Photoshop 레이어 모드</h3></div>
            <label className="switch-row"><input type="checkbox" checked={photoshop.enabled}
              onChange={e=>void editPhotoshop('enable',{enabled:e.target.checked})}/>
              <span><b>포토샵 모드 활성화</b>
              <small>레이어를 나누어 그리거나 숨기고, 화면 캡처를 배경으로 포함한 PSD를 저장합니다.</small></span>
            </label>
            <div className="field">
              <label htmlFor="brush-style">브러시 종류</label>
              <div className="ps-brush-row"><Paintbrush size={18}/>
                <select id="brush-style" value={photoshop.brush}
                  onChange={e=>void editPhotoshop('brush',{brush:e.target.value as BrushType})}>
                  {BRUSH_OPTIONS.map(b=><option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
            </div>
            {photoshop.enabled&&<>
              <div className="ps-desktop-heading"><b>레이어 관리</b>
                <button type="button" className="secondary-button" onClick={()=>void editPhotoshop('add')}>
                  <Plus size={15}/> 레이어 추가</button>
              </div>
              <div className="ps-desktop-layers">
                {photoshop.layers.slice().reverse().map(layer=><div key={layer.id}
                  className={'ps-desktop-layer '+(photoshop.activeLayerId===layer.id?'selected':'')}>
                  <button type="button" className="ps-desktop-name" title="현재 필기 레이어로 선택"
                    onClick={()=>void editPhotoshop('select',{id:layer.id})}>{layer.name}</button>
                  <button title="레이어 표시 전환" aria-label="레이어 표시 전환"
                    onClick={()=>void editPhotoshop(layer.visible?'hide':'show',{id:layer.id})}>
                    {layer.visible?<Eye size={16}/>:<EyeOff size={16}/>}</button>
                  <button aria-label="레이어 이름 변경" title="레이어 이름 변경"
                    onClick={()=>renamePhotoshopLayer(layer.id,layer.name)}><PenLine size={15}/></button>
                  <button aria-label="위로 이동" title="위로 이동"
                    onClick={()=>void editPhotoshop('up',{id:layer.id})}><ArrowUp size={15}/></button>
                  <button aria-label="아래로 이동" title="아래로 이동"
                    onClick={()=>void editPhotoshop('down',{id:layer.id})}><ArrowDown size={15}/></button>
                  <button disabled={photoshop.layers.length<=1} aria-label="레이어 삭제" title="레이어 삭제"
                    onClick={()=>void editPhotoshop('delete',{id:layer.id})}><Trash2 size={15}/></button>
                </div>)}
              </div>
              <button type="button" className="primary-button" onClick={()=>void action('psd')}>
                <FileDown size={18}/> 레이어 포함 PSD 저장
              </button>
              <p className="microcopy">PC 화면은 가장 아래 이미지 레이어로, S펜 필기는 각각 개별 이미지 레이어로 저장됩니다. PSD 저장은 필기를 자동 삭제하지 않습니다.</p>
            </>}
          </section>
        </div>}

        {section==='save'&&<div className="content-column">
          <section className="surface"><div className="surface-title"><FolderOpen size={18}/><h3>저장 위치 및 동작</h3></div>
            <div className="field"><label htmlFor="output-dir">PNG 저장 경로</label><div className="folder-row"><input id="output-dir" value={settings.outputFolder} onChange={e=>void setOption('outputFolder',e.target.value)} placeholder="비워두면 기본 사진 폴더"/><button className="icon-button" onClick={()=>void chooseFolder()} title="폴더 선택"><FolderOpen size={18}/></button></div><small>기본 경로: 사진 / PenStudyCaptures</small></div>
            <p className="microcopy">PNG와 PSD 저장 후에도 현재 필기와 모든 레이어는 그대로 유지됩니다. 지우려면 직접 지우기 버튼을 사용하세요.</p>
            <div className="field-title">PNG 캡처 방법</div>
            <button className="primary-button" onClick={()=>void action('save')}><Camera size={17}/> 전체 화면 PNG 저장 <kbd>{hotkeys.save}</kbd></button>
            <div className="quick-actions">
              <button onClick={()=>void action('region')}><Camera size={16}/> 드래그 영역 저장 <kbd>{hotkeys.region}</kbd></button>
              <button onClick={()=>void action('fixed')}><Camera size={16}/> 지정 영역 저장 <kbd>{hotkeys.fixed}</kbd></button>
            </div>
            <div className="field">
              <label>반복 촬영할 고정 영역</label>
              <p className="microcopy">{fixedRegion
                ?`설정됨 · 가로 ${Math.round(fixedRegion.width*100)}% × 세로 ${Math.round(fixedRegion.height*100)}% (화면 기준)`
                :'아직 지정된 영역이 없습니다. 아래 버튼으로 화면에서 드래그해 지정하세요.'}</p>
              <div className="quick-actions">
                <button onClick={()=>void action('configure-region')}><Camera size={16}/> {fixedRegion?'고정 영역 변경':'고정 영역 지정'}</button>
                <button disabled={!fixedRegion} onClick={()=>void clearFixedRegion()}><Trash2 size={16}/> 영역 해제</button>
              </div>
              <small>PC 마우스로 화면 위에서 드래그합니다. Esc를 누르면 취소됩니다. 고정 영역은 재시작 후에도 유지되며 화면 크기에 비례해 적용됩니다.</small>
            </div>
            {last&&<div className="small-note wrap-text">마지막 저장: {last}</div>}
          </section>
        </div>}

        {section==='appearance'&&<div className="content-column">
          <section className="surface"><div className="surface-title"><Settings2 size={18}/><h3>화면 테마</h3></div>
            <p className="muted">GUI의 색상 스타일을 선택하세요. 설정은 다음 실행에도 유지됩니다.</p>
            <div className="theme-options"><button className={'theme-card light-preview '+(theme==='light'?'selected':'')} onClick={()=>setTheme('light')}><div className="theme-window"><i/><i/><i/></div><Sun size={17}/> 화이트 모드 {theme==='light'&&<CheckCircle2 size={16}/>}</button>
              <button className={'theme-card dark-preview '+(theme==='dark'?'selected':'')} onClick={()=>setTheme('dark')}><div className="theme-window"><i/><i/><i/></div><Moon size={17}/> 블랙 다크 모드 {theme==='dark'&&<CheckCircle2 size={16}/>}</button>
            </div>
          </section>
          <section className="surface">
            <div className="surface-title"><Keyboard size={18}/><h3>사용자 지정 전역 단축키</h3></div>
            <p className="microcopy">PC 오버레이의 도구·레이어·저장·자동 연결 기능별 단축키를 지정할 수 있습니다. 기존 6개 외에는 기본 미지정으로, 다른 프로그램 단축키를 방해하지 않습니다. 입력칸을 누르고 F1~F12 또는 Ctrl/Alt + 영문·숫자 키를 누르세요. 해제 버튼으로 할당을 제거하며 Esc는 입력 취소입니다.</p>
            <div className="hotkey-list">
              {([
                ['save','현재 화면 PNG 저장'],
                ['region','드래그 영역 PNG 저장'],
                ['fixed','지정 영역 PNG 저장'],
                ['undo','마지막 필기/지우개 되돌리기'],
                ['clear','전체 필기 지우기'],
                ['eraser','펜 ↔ 지우개 전환'],
                ['mouse','Windows 마우스 모드'],
                ['ink','오버레이 필기 모드'],
                ['pen','펜 선택'],
                ['psd','레이어 PSD 저장'],
                ['configureRegion','고정 캡처 영역 다시 지정'],
                ['penThinner','펜 굵기 감소'],
                ['penThicker','펜 굵기 증가'],
                ['eraserThinner','지우개 굵기 감소'],
                ['eraserThicker','지우개 굵기 증가'],
                ['pressure','S펜 필압 켜기/끄기'],
                ['brush','브러시 종류 순환'],
                ['photoshop','레이어 모드 켜기/끄기'],
                ['layerAdd','새 레이어 추가'],
                ['layerPrev','이전 레이어 선택'],
                ['layerNext','다음 레이어 선택'],
                ['layerVisibility','현재 레이어 표시/숨기기'],
                ['colorNext','펜 색상 팔레트 순환'],
                ['toolbarLeft','왼쪽 PC 툴바 위치 초기화'],
                ['toolbarRight','오른쪽 PC 툴바 위치 초기화'],
                ['routeToggle','그림 프로그램 자동 연결 켜기/끄기']
              ] as const).map(([action,label])=><div className="hotkey-row" key={action}>
                <span>{label}</span>
                <input type="text" readOnly value={hotkeys[action]} disabled={hotkeyBusy}
                  onKeyDown={e=>captureKey(action,e)}
                  onFocus={e=>{
                    e.currentTarget.select();
                    void invoke('set_hotkey_capture_mode',{active:true})
                      .catch(error=>setHotkeyError('키 입력 준비 실패: '+String(error)));
                  }}
                  onBlur={()=>{void invoke('set_hotkey_capture_mode',{active:false})
                    .catch(error=>setHotkeyError(String(error)));}}
                  aria-label={label+' 단축키 지정'} placeholder="미지정"
                  title="클릭한 후 원하는 키 조합을 누르세요"/>
                <button type="button" className="icon-button" disabled={hotkeyBusy||!hotkeys[action]}
                  onClick={()=>void (async()=>{
                    try{
                      await invoke('set_hotkey_capture_mode',{active:false});
                      await applyHotkeyBindings({...hotkeys,[action]:''});
                    }catch(error){setHotkeyError('단축키 해제 실패: '+String(error));}
                  })()}
                  title={label+' 단축키 해제'} aria-label={label+' 단축키 해제'}><XCircle size={15}/></button>
              </div>)}
            </div>
            <div className="hotkey-footer">
              <button type="button" className="secondary-button" disabled={hotkeyBusy}
                onClick={()=>void applyHotkeyBindings({...DEFAULT_HOTKEYS})}>기본 단축키로 복원</button>
              {hotkeyNotice&&<span className="microcopy" role="status">{hotkeyNotice}</span>}
            </div>
            {hotkeyError&&<p className="hotkey-error" role="alert">{hotkeyError}</p>}
          </section>
          <section className="surface"><div className="surface-title"><Activity size={18}/><h3>현재 버전</h3></div><p className="microcopy">PenStudy Studio v0.1 · Windows Tauri/React · S24 Ultra 연동. 시스템 테마는 오버레이와 별도로 설정됩니다.</p></section>
        </div>}

        {section==='help'&&<div className="content-column">
          <section className="surface"><div className="surface-title"><BookOpen size={18}/><h3>빠른 시작</h3></div>
            <div className="guide-steps">{[
              ['01','기기 연결에서 USB 또는 Wi-Fi를 선택하고 서버를 시작하세요.'],
              ['02','S24 Ultra의 PenStudy Pad에서 PC 주소와 인증 토큰을 입력하세요.'],
              ['03','휴대폰에 S펜으로 필기하면 PC 화면에 표시됩니다.'],
              ['04',hotkeys.save+'로 전체 화면, '+hotkeys.region+'로 드래그 영역, '+hotkeys.fixed+'로 지정 영역을 PNG 저장합니다.']
            ].map(([number,description])=><div className="guide-step" key={number}><span>{number}</span><p>{description}</p></div>)}</div>
          </section>
          <section className="surface"><div className="surface-title"><Keyboard size={18}/><h3>키보드 단축키</h3></div>
            <div className="shortcut-row"><span>현재 화면 저장</span><kbd>{hotkeys.save}</kbd></div>
            <div className="shortcut-row"><span>드래그 영역 저장</span><kbd>{hotkeys.region}</kbd></div>
            <div className="shortcut-row"><span>지정 영역 저장</span><kbd>{hotkeys.fixed}</kbd></div>
            <div className="shortcut-row"><span>마지막 필기/지우기 되돌리기</span><kbd>{hotkeys.undo}</kbd></div>
            <div className="shortcut-row"><span>모든 필기 삭제</span><kbd>{hotkeys.clear}</kbd></div>
            <div className="shortcut-row"><span>펜 ↔ 지우개 전환</span><kbd>{hotkeys.eraser}</kbd></div>
            <button type="button" className="text-button" onClick={()=>setSection('appearance')}>환경설정에서 단축키 변경 <ArrowRight size={15}/></button>
          </section>
          <section className="surface"><div className="surface-title"><ShieldCheck size={18}/><h3>연결 시 유의사항</h3></div><p className="muted">Windows 화면의 작은 플로팅 툴바에서도 펜 색상·굵기·필압과 저장·되돌리기·지우기를 제어할 수 있습니다.</p><p className="muted">USB 모드는 ADB reverse를 설정해야 합니다. Wi-Fi 서버는 신뢰할 수 있는 개인 네트워크에서만 켜세요. 오버레이는 마우스 클릭을 통과시켜 웹페이지를 조작하며 필기할 수 있습니다.</p></section>
        </div>}
      </div>
    </main>
    {error&&<div className="error-toast" role="alert"><XCircle size={17}/><span>{error}</span><button onClick={()=>setError('')}>닫기</button></div>}
  </div>;
}
