import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {Camera,Eraser,FileDown,GripVertical,Layers3,Maximize2,MousePointer2,Paintbrush,PenLine,RotateCcw,Trash2} from 'lucide-react';
import {DEFAULT_PEN_STYLE,ERASER_MIN_WIDTH,ERASER_MAX_WIDTH,type PenStyle,type InkTool} from '../../../packages/protocol/ink';
import {loadHotkeys,type HotkeyBindings} from './hotkeys';
import {BRUSH_OPTIONS,DEFAULT_PHOTOSHOP,type PhotoshopState,type BrushType} from '../../../packages/protocol/photoshop';
import './toolbar.css';

function Toolbar(){
  const side=getCurrentWindow().label==='toolbar-right'?'right':'left';
  const [style,setStyle]=useState<PenStyle>(DEFAULT_PEN_STYLE);
  const styleRef=useRef<PenStyle>(DEFAULT_PEN_STYLE);
  const [error,setError]=useState('');
  const [mode,setMode]=useState<'mouse'|'ink'>('mouse');
  const [tool,setTool]=useState<InkTool>('pen');
  const [photoshop,setPhotoshop]=useState<PhotoshopState>(DEFAULT_PHOTOSHOP);
  const [hotkeys,setHotkeys]=useState<HotkeyBindings>(loadHotkeys);
  const [autoRoute,setAutoRoute]=useState(true);
  useEffect(()=>{
    let live=true;const cleanups:Array<()=>void>=[];
    void invoke<'mouse'|'ink'>('get_input_mode').then(next=>{if(live)setMode(next);}).catch(e=>setError(String(e)));
    void invoke<InkTool>('get_ink_tool').then(next=>{if(live)setTool(next);}).catch(e=>setError(String(e)));
    void invoke<PhotoshopState>('get_photoshop').then(next=>{if(live)setPhotoshop(next);}).catch(e=>setError(String(e)));
    void invoke<HotkeyBindings>('get_hotkeys').then(next=>{if(live)setHotkeys(next);}).catch(e=>setError(String(e)));
    void invoke<boolean>('get_auto_canvas_routing').then(next=>{if(live)setAutoRoute(next);}).catch(e=>setError(String(e)));
    void invoke<PenStyle>('get_pen_style').then(next=>{
      if(live){styleRef.current=next;setStyle(next);}
    }).catch(e=>setError(String(e)));
    void listen<'mouse'|'ink'>('input-mode-changed',e=>{
      if(live)setMode(e.payload);
    }).then(fn=>{if(live)cleanups.push(fn);else fn();}).catch(e=>setError(String(e)));
    void listen<PhotoshopState>('photoshop-state-changed',e=>{
      if(live)setPhotoshop(e.payload);
    }).then(fn=>{if(live)cleanups.push(fn);else fn();}).catch(e=>setError(String(e)));
    void listen<InkTool>('ink-tool-changed',e=>{
      if(live)setTool(e.payload);
    }).then(fn=>{if(live)cleanups.push(fn);else fn();}).catch(e=>setError(String(e)));
    void listen<HotkeyBindings>('hotkeys-updated',e=>{
      if(live)setHotkeys(e.payload);
    }).then(fn=>{if(live)cleanups.push(fn);else fn();}).catch(e=>setError(String(e)));
    void listen<boolean>('auto-canvas-routing-changed',e=>{
      if(live)setAutoRoute(e.payload);
    }).then(fn=>{if(live)cleanups.push(fn);else fn();}).catch(e=>setError(String(e)));
    void listen<PenStyle>('pen-style-changed',e=>{
      styleRef.current=e.payload;
      setStyle(e.payload);
    }).then(fn=>{if(live)cleanups.push(fn);else fn();}).catch(e=>setError(String(e)));
    return()=>{live=false;cleanups.forEach(fn=>fn());};
  },[]);
  function update<K extends keyof PenStyle>(key:K,value:PenStyle[K]){
    const next={...styleRef.current,[key]:value};
    styleRef.current=next;setStyle(next);
    void invoke('set_pen_style',{style:next}).catch(e=>setError(String(e)));
  }
  function chooseMode(value:'mouse'|'ink'){
    setMode(value);
    void invoke('set_input_mode',{mode:value}).catch(e=>setError(String(e)));
  }
  function chooseTool(value:InkTool){
    void invoke('set_input_mode',{mode:'ink'})
      .then(()=>invoke('set_ink_tool',{tool:value}))
      .catch(e=>setError(String(e)));
  }
  function togglePhotoshop(){
    void invoke('edit_photoshop',{action:'enable',enabled:!photoshop.enabled})
      .catch(e=>setError(String(e)));
  }
  function beginToolbarDrag(e:ReactPointerEvent<HTMLButtonElement>){
    if(e.button!==0)return;
    e.preventDefault();
    void getCurrentWindow().startDragging().catch(error=>setError(String(error)));
  }
  function resetToolbar(){
    void invoke('reset_toolbar_position',{side}).catch(error=>setError(String(error)));
  }
  function chooseBrush(value:BrushType){
    void invoke('edit_photoshop',{action:'brush',brush:value}).catch(error=>setError(String(error)));
  }
  function action(action:'save'|'psd'|'undo'|'clear'){
    void invoke('request_action',{action}).catch(e=>setError(String(e)));
  }
  return <div className={'ink-tools ink-tools-'+side}>
    <button type="button" className="toolbar-grip" aria-label={side==='left'?'왼쪽 툴바 이동':'오른쪽 툴바 이동'}
      title="손잡이를 드래그하여 이 툴바만 이동" onPointerDown={beginToolbarDrag}>
      <GripVertical size={19}/>
    </button>
    {side==='left'?<>
      <div className="tool-mode" role="group" aria-label="S펜 작동 모드">
        <button type="button" className={mode==='mouse'?'active':''}
          aria-pressed={mode==='mouse'} title="PC 마우스 제어"
          onClick={()=>chooseMode('mouse')}><MousePointer2 size={16}/></button>
        <button type="button" className={mode==='ink'?'active':''}
          aria-pressed={mode==='ink'} title="PC 투명 오버레이 필기"
          onClick={()=>chooseMode('ink')}><PenLine size={16}/></button>
      </div>
      <div className="tool-ink" role="group" aria-label="S펜 필기 도구">
        <button type="button" className={mode==='ink'&&tool==='pen'?'active':''}
          aria-pressed={mode==='ink'&&tool==='pen'} title="펜"
          onClick={()=>chooseTool('pen')}><PenLine size={16}/></button>
        <button type="button" className={mode==='ink'&&tool==='eraser'?'active':''}
          aria-pressed={mode==='ink'&&tool==='eraser'} title={`지우개 (${hotkeys.eraser}) · 현재 레이어만`}
          onClick={()=>chooseTool('eraser')}><Eraser size={16}/></button>
      </div>
      <button type="button" onClick={()=>action('undo')}
        title={`선택한 레이어의 마지막 작업 되돌리기 (${hotkeys.undo})`}>
        <RotateCcw size={17}/>
      </button>
      <button type="button" onClick={()=>action('clear')}
        title={photoshop.enabled?`선택한 레이어 지우기 (${hotkeys.clear})`:`전체 지우기 (${hotkeys.clear})`}>
        <Trash2 size={17}/>
      </button>
      <button type="button" className="save" onClick={()=>action('save')}
        title={`PNG 저장 (${hotkeys.save})`}><Camera size={17}/><span>저장</span></button>
    </>:<>
      <label className="tool-color" title="펜 색상">
        <input type="color" aria-label="펜 색상" value={style.color}
          onChange={e=>update('color',e.target.value)}/>
      </label>
      <div className="tool-width">
        <span>펜 {Math.round(style.width)}px</span>
        <input type="range" min="1" max="20" step="1" value={style.width}
          aria-label="펜 두께" onChange={e=>update('width',Number(e.target.value))}/>
      </div>
      <div className="tool-eraser-width">
        <span>지우개 {Math.round(style.eraserWidth)}px</span>
        <input type="range" min={ERASER_MIN_WIDTH} max={ERASER_MAX_WIDTH}
          step="4" value={style.eraserWidth} aria-label="지우개 굵기"
          onChange={e=>update('eraserWidth',Number(e.target.value))}/>
      </div>
      <label className="tool-pressure" title="필압 사용">
        <input type="checkbox" checked={style.pressureEnabled}
          onChange={e=>update('pressureEnabled',e.target.checked)}/> 필압
      </label>
      <label className="tool-brush" title="브러시 타입">
        <Paintbrush size={16}/>
        <select aria-label="브러시 종류" value={photoshop.brush}
          onChange={e=>chooseBrush(e.target.value as BrushType)}>
          {BRUSH_OPTIONS.map(b=><option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </label>
      <button type="button" className={autoRoute?'active':''}
        onClick={()=>void invoke('set_auto_canvas_routing',{enabled:!autoRoute}).catch(e=>setError(String(e)))}
        aria-pressed={autoRoute} aria-label="그림 앱 자동 캔버스 연결"
        title={`그림 앱 자동 캔버스 연결 ${autoRoute?'켜짐':'꺼짐'} (${hotkeys.routeToggle||'단축키 미지정'})`}>
        <MousePointer2 size={17}/>
      </button>
      <button type="button" className={photoshop.enabled?'active ps-mode':''}
        onClick={togglePhotoshop} aria-pressed={photoshop.enabled}
        title="포토샵 레이어 모드"><Layers3 size={17}/></button>
      {photoshop.enabled&&<button type="button" onClick={()=>action('psd')}
        title="PSD 레이어 저장"><FileDown size={17}/></button>}
    </>}
    <button type="button" onClick={resetToolbar} aria-label={side==='left'?'왼쪽 툴바 위치 초기화':'오른쪽 툴바 위치 초기화'}
      title="이 툴바만 기본 위치로 복원"><Maximize2 size={17}/></button>
    {error&&<div className="tool-error" title={error} onClick={()=>setError('')}>{error}</div>}
  </div>;

}
createRoot(document.getElementById('root')!).render(<Toolbar/>);
