import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {invoke} from '@tauri-apps/api/core';
import {listen,emit} from '@tauri-apps/api/event';
import {writePsdUint8Array} from 'ag-psd';
import {LayerInkHistory} from '../../../packages/protocol/layerHistory';
import {loadSettings,type PenSettings} from './settings';
import {pressureWidth,ERASER_WIDTH,type InkPoint,type PenStyle,type InkTool}
  from '../../../packages/protocol/ink';
import {DEFAULT_PHOTOSHOP,type PhotoshopState,type BrushType}
  from '../../../packages/protocol/photoshop';

type CaptureRegion={x:number;y:number;width:number;height:number};
type SelectionMode='once'|'fixed';
type SelectionDrag={startX:number;startY:number;endX:number;endY:number};
type Stroke={
  tool:InkTool;layerId:string;brush:BrushType;
  points:InkPoint[];color:string;width:number;
  pressureEnabled:boolean;pressureSensitivity:number;
};
type InkPacket={
  type:'begin'|'move'|'move-batch'|'end'|'hover'|'hover-end'|'undo'|'clear';
  x?:number;y?:number;pressure?:number;points?:InkPoint[];
  tool?:InkTool;layerId?:string;brush?:BrushType;
};

function Overlay(){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const cursorRef=useRef<HTMLDivElement|null>(null);
  const history=useRef(new LayerInkHistory<Stroke>());
  const active=useRef<Stroke|null>(null);
  const settings=useRef<PenSettings>(loadSettings());
  const toolRef=useRef<InkTool>('pen');
  const photoshop=useRef<PhotoshopState>(DEFAULT_PHOTOSHOP);
  const surfaces=useRef<Map<string,HTMLCanvasElement>>(new Map());
  const saving=useRef(false);
  const [selectionMode,setSelectionMode]=useState<SelectionMode|null>(null);
  const [selectionDrag,setSelectionDrag]=useState<SelectionDrag|null>(null);
  const selectionRef=useRef<SelectionMode|null>(null);
  const dragPointer=useRef<{id:number;x:number;y:number}|null>(null);
  function endSelection(region:CaptureRegion|null){
    const mode=selectionRef.current;
    if(!mode)return;
    selectionRef.current=null;dragPointer.current=null;
    setSelectionMode(null);setSelectionDrag(null);
    void emit('capture-selection-finished',{mode,region})
      .catch(error=>void emit('capture-failed',{error:String(error)}));
  }
  function relativePoint(e:ReactPointerEvent<HTMLDivElement>){
    const bounds=e.currentTarget.getBoundingClientRect();
    return {
      x:Math.max(0,Math.min(1,(e.clientX-bounds.left)/bounds.width)),
      y:Math.max(0,Math.min(1,(e.clientY-bounds.top)/bounds.height))
    };
  }
  function selectionDown(e:ReactPointerEvent<HTMLDivElement>){
    if(e.button!==0||dragPointer.current)return;
    e.preventDefault();
    const p=relativePoint(e);
    dragPointer.current={id:e.pointerId,x:p.x,y:p.y};
    setSelectionDrag({startX:p.x,startY:p.y,endX:p.x,endY:p.y});
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function selectionMove(e:ReactPointerEvent<HTMLDivElement>){
    const drag=dragPointer.current;
    if(!drag||drag.id!==e.pointerId)return;
    const p=relativePoint(e);
    setSelectionDrag({startX:drag.x,startY:drag.y,endX:p.x,endY:p.y});
  }
  function selectionUp(e:ReactPointerEvent<HTMLDivElement>){
    const drag=dragPointer.current;
    if(!drag||drag.id!==e.pointerId)return;
    const p=relativePoint(e);
    dragPointer.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const region:CaptureRegion={
      x:Math.min(drag.x,p.x),y:Math.min(drag.y,p.y),
      width:Math.abs(p.x-drag.x),height:Math.abs(p.y-drag.y)
    };
    if(region.width*window.innerWidth<6||region.height*window.innerHeight<6){
      setSelectionDrag(null);
      void emit('capture-failed',{error:'최소 6×6픽셀 이상의 영역을 드래그하세요.'});
      return;
    }
    endSelection(region);
  }

  useEffect(()=>{
    const canvas=canvasRef.current!;
    const cursor=cursorRef.current!;
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    let width=window.innerWidth,height=window.innerHeight;
    let hasNonBase=false;

    function sizeCanvas(){
      const dpr=window.devicePixelRatio||1;
      width=window.innerWidth;height=window.innerHeight;
      const w=Math.max(1,Math.round(width*dpr));
      const h=Math.max(1,Math.round(height*dpr));
      if(canvas.width!==w||canvas.height!==h){
        canvas.width=w;canvas.height=h;
        ctx!.setTransform(dpr,0,0,dpr,0,0);
        surfaces.current.clear();
      }
    }
    function layerSurface(id:string):HTMLCanvasElement{
      let surface=surfaces.current.get(id);
      if(!surface){
        surface=document.createElement('canvas');
        surface.width=canvas.width;surface.height=canvas.height;
        surface.getContext('2d')?.setTransform(window.devicePixelRatio||1,0,0,window.devicePixelRatio||1,0,0);
        surfaces.current.set(id,surface);
      }
      return surface;
    }
    function lineWidth(stroke:Stroke,point:InkPoint){
      const base=stroke.tool==='eraser'
        ?stroke.width
        :pressureWidth(stroke.width,point.pressure,stroke.pressureEnabled,stroke.pressureSensitivity);
      if(stroke.tool==='eraser')return base;
      switch(stroke.brush){
        case 'marker':return base*3;
        case 'pencil':return Math.max(.6,base*.65);
        case 'airbrush':return base*3;
        default:return base;
      }
    }
    function setupBrush(target:CanvasRenderingContext2D,stroke:Stroke,point:InkPoint){
      target.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';
      target.globalAlpha=stroke.tool==='eraser'?1:
        stroke.brush==='marker'?.34:stroke.brush==='pencil'?.8:
        stroke.brush==='airbrush'?.55:1;
      target.strokeStyle=stroke.tool==='eraser'?'#000':stroke.color;
      target.fillStyle=stroke.tool==='eraser'?'#000':stroke.color;
      target.lineCap=stroke.brush==='pencil'?'square':'round';
      target.lineJoin='round';
      target.lineWidth=lineWidth(stroke,point);
    }
    function airbrushDot(target:CanvasRenderingContext2D,stroke:Stroke,point:InkPoint){
      const x=point.x*width,y=point.y*height;
      const radius=Math.max(3,lineWidth(stroke,point)/2);
      const gradient=target.createRadialGradient(x,y,0,x,y,radius);
      gradient.addColorStop(0,stroke.color);
      gradient.addColorStop(.35,stroke.color+'70');
      gradient.addColorStop(1,stroke.color+'00');
      target.fillStyle=gradient;
      target.beginPath();target.arc(x,y,radius,0,Math.PI*2);target.fill();
    }
    function drawDotTo(target:CanvasRenderingContext2D,stroke:Stroke,point:InkPoint){
      target.save();setupBrush(target,stroke,point);
      if(stroke.brush==='airbrush'&&stroke.tool!=='eraser'){
        airbrushDot(target,stroke,point);
      }else{
        target.beginPath();
        target.arc(point.x*width,point.y*height,lineWidth(stroke,point)/2,0,Math.PI*2);
        target.fill();
      }
      target.restore();
    }
    function drawSegmentTo(target:CanvasRenderingContext2D,stroke:Stroke,a:InkPoint,b:InkPoint){
      target.save();setupBrush(target,stroke,b);
      if(stroke.brush==='airbrush'&&stroke.tool!=='eraser'){
        const distance=Math.hypot((b.x-a.x)*width,(b.y-a.y)*height);
        const steps=Math.max(1,Math.ceil(distance/Math.max(3,lineWidth(stroke,b)/5)));
        for(let i=1;i<=Math.min(steps,120);i++){
          const t=i/Math.min(steps,120);
          airbrushDot(target,stroke,{
            x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
            pressure:a.pressure+(b.pressure-a.pressure)*t
          });
        }
      }else{
        target.beginPath();
        target.moveTo(a.x*width,a.y*height);
        target.lineTo(b.x*width,b.y*height);
        target.stroke();
      }
      target.restore();
    }
    function drawDot(stroke:Stroke,point:InkPoint){
      drawDotTo(ctx!,stroke,point);
    }
    function drawSegment(stroke:Stroke,a:InkPoint,b:InkPoint){
      drawSegmentTo(ctx!,stroke,a,b);
    }
    function compositeLayers(){
      ctx!.clearRect(0,0,width,height);
      for(const layer of photoshop.current.layers){
        if(!layer.visible)continue;
        const surface=surfaces.current.get(layer.id);
        if(surface)ctx!.drawImage(surface,0,0,width,height);
      }
    }
    function renderAll(){
      sizeCanvas();
      hasNonBase=history.current.strokes.some(stroke=>stroke.layerId!=='base');
      const layered=photoshop.current.enabled||hasNonBase;
      ctx!.clearRect(0,0,width,height);
      surfaces.current.clear();
      for(const stroke of history.current.strokes){
        if(!stroke.points.length)continue;
        if(layered){
          const surface=layerSurface(stroke.layerId);
          const target=surface.getContext('2d')!;
          drawDotTo(target,stroke,stroke.points[0]);
          for(let i=1;i<stroke.points.length;i++)
            drawSegmentTo(target,stroke,stroke.points[i-1],stroke.points[i]);
        }else{
          drawDot(stroke,stroke.points[0]);
          for(let i=1;i<stroke.points.length;i++)drawSegment(stroke,stroke.points[i-1],stroke.points[i]);
        }
      }
      if(layered)compositeLayers();
    }
    function hideHover(){cursor.style.display='none';}
    function showHover(x:number,y:number){
      if(!Number.isFinite(x)||!Number.isFinite(y))return;
      cursor.style.transform=`translate3d(${x*width}px,${y*height}px,0) translate(-50%,-50%)`;
      const erasing=toolRef.current==='eraser';
      const eraserSize=settings.current.eraserWidth??ERASER_WIDTH;
      cursor.style.width=erasing?eraserSize+'px':'20px';
      cursor.style.height=erasing?eraserSize+'px':'20px';
      cursor.style.borderColor=erasing?'#ffba73':settings.current.color;
      cursor.style.display='block';
    }
    function insertPoint(point:InkPoint,compositeNow=true){
      const stroke=active.current;
      if(!stroke)return;
      const points=stroke.points;
      const previous=points[points.length-1];
      points.push(point);
      if(photoshop.current.enabled||hasNonBase){
        const target=layerSurface(stroke.layerId).getContext('2d')!;
        if(previous)drawSegmentTo(target,stroke,previous,point);
        else drawDotTo(target,stroke,point);
        if(compositeNow)compositeLayers();
      }else{
        if(previous)drawSegment(stroke,previous,point);
        else drawDot(stroke,point);
      }
    }
    function parsePoint(point:unknown):InkPoint|null{
      if(!point||typeof point!=='object')return null;
      const p=point as Record<string,unknown>;
      if(typeof p.x!=='number'||typeof p.y!=='number'||typeof p.pressure!=='number')return null;
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.pressure))return null;
      if(p.x<0||p.x>1||p.y<0||p.y>1||p.pressure<0||p.pressure>1)return null;
      return {x:p.x,y:p.y,pressure:p.pressure};
    }
    function setPhotoshop(next:PhotoshopState){
      const ids=new Set(next.layers.map(layer=>layer.id));
      for(const layer of photoshop.current.layers){
        if(!ids.has(layer.id))history.current.dropLayer(layer.id);
      }
      photoshop.current=next;
      active.current=null;
      renderAll();
    }
    function currentLayerScope():string|null{
      // Photoshop edits must never affect any other visible or hidden layer.
      return photoshop.current.enabled?photoshop.current.activeLayerId:null;
    }
    function clearInk(){
      history.current.clear(currentLayerScope());
      active.current=null;hideHover();renderAll();
    }
    function undoInk(){
      history.current.undo(currentLayerScope());
      active.current=null;renderAll();
    }
    async function exportPsd(){
      if(saving.current)return;
      if(!photoshop.current.enabled){
        void emit('capture-failed',{error:'PSD 저장은 포토샵 모드에서만 지원합니다.'});return;
      }
      saving.current=true;
      try{
        renderAll();
        const pixelWidth=canvas.width,pixelHeight=canvas.height;
        if(pixelWidth>30000||pixelHeight>30000)throw new Error('PSD 최대 크기를 초과했습니다.');
        const screenshot=await invoke<string>('capture_desktop_base64');
        const background=new Image();
        background.src=screenshot;
        await background.decode();
        const base=document.createElement('canvas');
        base.width=pixelWidth;base.height=pixelHeight;
        base.getContext('2d')!.drawImage(background,0,0,pixelWidth,pixelHeight);
        const merged=document.createElement('canvas');
        merged.width=pixelWidth;merged.height=pixelHeight;
        const mergedCtx=merged.getContext('2d')!;
        mergedCtx.drawImage(base,0,0);
        for(const layer of photoshop.current.layers){
          if(layer.visible){
            const surface=surfaces.current.get(layer.id);
            if(surface)mergedCtx.drawImage(surface,0,0);
          }
        }
        // ag-psd uses top-to-bottom Photoshop order; the live overlay stores
        // layers from bottom to top. Every hidden layer still retains its bitmap.
        const children=photoshop.current.layers.slice().reverse().map(layer=>({
          name:layer.name,hidden:!layer.visible,canvas:layerSurface(layer.id),
        }));
        children.push({name:'PC 화면',hidden:false,canvas:base});
        const psd=writePsdUint8Array({
          width:pixelWidth,height:pixelHeight,
          canvas:merged,children
        },{generateThumbnail:false});
        let binary='';
        for(let i=0;i<psd.length;i+=0x8000)
          binary+=String.fromCharCode(...psd.subarray(i,i+0x8000));
        const path=await invoke<string>('save_psd',{
          psdBase64:btoa(binary),
          outputFolder:settings.current.outputFolder||null
        });
        void emit('capture-saved',{path});
      }catch(error){
        void emit('capture-failed',{error:'PSD 저장 실패: '+String(error)});
      }finally{saving.current=false;}
    }
    async function savePng(region:CaptureRegion|null=null){
      if(saving.current||selectionRef.current)return;
      saving.current=true;
      try{
        const png=canvas.toDataURL('image/png');
        await invoke('save_capture',{
          canvasDataUrl:png,outputFolder:settings.current.outputFolder||null,region
        });
        // Saving a PNG never modifies layer strokes; clearing is always manual.
      }catch(error){
        await emit('capture-failed',{error:String(error)});
      }finally{saving.current=false;}
    }
    function beginSelection(mode:SelectionMode){
      if(saving.current||selectionRef.current)return;
      selectionRef.current=mode;dragPointer.current=null;
      setSelectionDrag(null);setSelectionMode(mode);
      void invoke('set_capture_selection_active',{active:true}).catch(error=>{
        selectionRef.current=null;
        setSelectionMode(null);setSelectionDrag(null);
        void emit('capture-failed',{error:'영역 선택을 시작할 수 없습니다: '+String(error)});
      });
    }
    const onSelectionKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&selectionRef.current){
        event.preventDefault();endSelection(null);
      }
    };
    document.addEventListener('keydown',onSelectionKey);
    const onResize=()=>renderAll();
    window.addEventListener('resize',onResize);
    const unsubscribe:Array<()=>void>=[];
    let alive=true;
    void invoke<PhotoshopState>('get_photoshop').then(setPhotoshop).catch(()=>{});
    void invoke<InkTool>('get_ink_tool').then(tool=>{toolRef.current=tool;}).catch(()=>{});
    void Promise.all([
      listen<boolean>('phone-connected',e=>{if(!e.payload)hideHover();}),
      listen<PhotoshopState>('photoshop-state-changed',e=>setPhotoshop(e.payload)),
      listen<InkPacket>('pen-packet',e=>{
        const p=e.payload;
        if(p.type==='hover'){if(typeof p.x==='number'&&typeof p.y==='number')showHover(p.x,p.y);return;}
        if(p.type==='hover-end'){hideHover();return;}
        if(p.type==='clear'){clearInk();return;}
        if(p.type==='undo'){undoInk();return;}
        if(p.type==='end'){active.current=null;return;}
        if(p.type==='begin'){
          const pt=parsePoint(p);
          if(!pt)return;
          const style=settings.current;
          const layerId=p.layerId??'base';
          if(photoshop.current.enabled &&
             !photoshop.current.layers.some(layer=>layer.id===layerId&&layer.visible))return;
          const tool=p.tool==='eraser'?'eraser':'pen';
          const stroke:Stroke={
            tool,layerId,
            brush:p.brush??'solid',
            points:[],color:style.color,
            width:tool==='eraser'?style.eraserWidth:style.width,
            pressureEnabled:tool==='eraser'?false:style.pressureEnabled,
            pressureSensitivity:style.pressureSensitivity
          };
          active.current=stroke;history.current.add(stroke);
          hideHover();insertPoint(pt);return;
        }
        if(p.type==='move-batch'){
          if(!Array.isArray(p.points))return;
          for(const value of p.points){
            const pt=parsePoint(value);
            if(pt)insertPoint(pt,false);
          }
          if(photoshop.current.enabled||hasNonBase)compositeLayers();
          return;
        }
        if(p.type==='move'){const pt=parsePoint(p);if(pt)insertPoint(pt);}
      }),
      listen<PenSettings>('settings-updated',e=>{settings.current=e.payload;}),
      listen<PenStyle>('pen-style-changed',e=>{settings.current={...settings.current,...e.payload};}),
      listen<InkTool>('ink-tool-changed',e=>{toolRef.current=e.payload;}),
      listen('undo-requested',()=>{undoInk();}),
      listen('clear-requested',()=>{clearInk();}),
      listen('psd-requested',()=>{void exportPsd();}),
      listen('capture-region-requested',()=>beginSelection('once')),
      listen('capture-configure-region-requested',()=>beginSelection('fixed')),
      listen('capture-fixed-requested',()=>{
        if(saving.current||selectionRef.current)return;
        void invoke<CaptureRegion|null>('get_fixed_capture_region').then(region=>{
          if(!region){
            void emit('capture-failed',{error:'고정 영역이 없습니다. 저장 설정에서 먼저 영역을 지정하세요.'});
            return;
          }
          void savePng(region);
        }).catch(error=>void emit('capture-failed',{error:String(error)}));
      }),
      listen<{mode:SelectionMode;region:CaptureRegion|null}>('capture-selection-finished',e=>{
        void (async()=>{
          try{
            await invoke('set_capture_selection_active',{active:false});
            const {mode,region}=e.payload;
            if(!region)return;
            if(mode==='fixed')await invoke('set_fixed_capture_region',{region});
            else await savePng(region);
          }catch(error){
            void emit('capture-failed',{error:'영역 선택 처리 실패: '+String(error)});
          }
        })();
      }),
      listen('capture-requested',()=>{void savePng();})
    ]).then(items=>{
      if(alive)unsubscribe.push(...items);
      else items.forEach(fn=>fn());
    }).catch(e=>{void emit('capture-failed',{error:String(e)});});
    renderAll();
    return()=>{
      alive=false;window.removeEventListener('resize',onResize);
      document.removeEventListener('keydown',onSelectionKey);
      if(selectionRef.current){void invoke('set_capture_selection_active',{active:false});}
      unsubscribe.forEach(fn=>fn());
    };
  },[]);
  return <div style={{position:'fixed',inset:0,background:'transparent',pointerEvents:'none'}}>
    <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'100%',background:'transparent',pointerEvents:'none'}}/>
    <div ref={cursorRef} aria-hidden="true" style={{
      position:'absolute',left:0,top:0,width:20,height:20,display:'none',borderRadius:'50%',
      border:'2px solid #4DBEFF',boxShadow:'0 0 0 2px #080808b0,0 0 14px #fff8',
      transform:'translate(-50%,-50%)',pointerEvents:'none',willChange:'transform'
    }}/>
    {selectionMode&&<div
      aria-label={selectionMode==='once'?'한 번 캡처할 영역 선택':'반복 캡처할 영역 지정'}
      onPointerDown={selectionDown} onPointerMove={selectionMove}
      onPointerUp={selectionUp} onPointerCancel={()=>{dragPointer.current=null;setSelectionDrag(null);}}
      onContextMenu={e=>e.preventDefault()}
      style={{position:'absolute',inset:0,pointerEvents:'auto',
        cursor:'crosshair',touchAction:'none',userSelect:'none'}}>
      {selectionDrag?<>
        <div style={{position:'absolute',pointerEvents:'none',
          left:(Math.min(selectionDrag.startX,selectionDrag.endX)*100)+'%',
          top:(Math.min(selectionDrag.startY,selectionDrag.endY)*100)+'%',
          width:(Math.abs(selectionDrag.endX-selectionDrag.startX)*100)+'%',
          height:(Math.abs(selectionDrag.endY-selectionDrag.startY)*100)+'%',
          border:'2px solid #67C4FF',background:'rgba(90,180,255,0.09)',
          boxShadow:'0 0 0 200vmax rgba(3,10,20,0.46)'}}/>
      </>:<div style={{position:'absolute',inset:0,background:'rgba(3,10,20,0.35)',pointerEvents:'none'}}/>}
      <div style={{position:'absolute',top:22,left:'50%',transform:'translateX(-50%)',
        color:'#fff',background:'#101827ed',border:'1px solid #65baff',
        padding:'10px 16px',borderRadius:8,fontSize:14,pointerEvents:'none',
        whiteSpace:'nowrap',boxShadow:'0 4px 24px #0008'}}>
        {selectionMode==='once'?'드래그한 영역만 PNG로 저장합니다':'반복 캡처할 영역을 드래그해서 기억합니다'} · Esc 취소
      </div>
    </div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Overlay/>);
