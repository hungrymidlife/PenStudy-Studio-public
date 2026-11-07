import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {BookmarkPlus,Check,Palette} from 'lucide-react';

const PRESETS=['#171717','#FFFFFF','#E84B4B','#FF9340','#F4D34E','#43C983','#39A9F4','#5257E8','#A56CF4','#F46FB1','#9EAFB6','#865B39'];
const STORAGE_KEY='penstudy.savedColors.v1';
import {canonicalHex,hexToHsv,hsvToHex} from './colorMath';

const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));
function loadSaved():string[]{
  try{const parsed:unknown=JSON.parse(localStorage.getItem(STORAGE_KEY)??'[]');
    return Array.isArray(parsed)?parsed.filter((v):v is string=>typeof v==='string').map(v=>canonicalHex(v)).filter((v):v is string=>Boolean(v)).slice(0,12):[];
  }catch{return [];}
}
type Props={value:string;onChange:(color:string)=>void};
export function ColorPicker({value,onChange}:Props){
  const [hue,setHue]=useState(()=>hexToHsv(value).h);
  const [hexInput,setHexInput]=useState(value.toUpperCase());
  const [saved,setSaved]=useState<string[]>(loadSaved);
  const dragging=useRef(false);
  const hsv=hexToHsv(value);
  useEffect(()=>{
    setHexInput(value.toUpperCase());
    const next=hexToHsv(value);
    if(next.s>0.005)setHue(next.h);
  },[value]);
  function updatePoint(e:ReactPointerEvent<HTMLDivElement>){
    const rect=e.currentTarget.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    const s=clamp((e.clientX-rect.left)/rect.width);
    const v=1-clamp((e.clientY-rect.top)/rect.height);
    onChange(hsvToHex(hue,s,v));
  }
  function begin(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType==='mouse'&&e.button!==0)return;
    dragging.current=true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePoint(e);
  }
  function move(e:ReactPointerEvent<HTMLDivElement>){if(dragging.current)updatePoint(e);}
  function end(e:ReactPointerEvent<HTMLDivElement>){
    dragging.current=false;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function saveColor(){
    const safe=canonicalHex(value);if(!safe)return;
    setSaved(previous=>{
      const next=[safe,...previous.filter(c=>c!==safe)].slice(0,12);
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}catch{/* Storage unavailable */}
      return next;
    });
  }
  return <div className="color-picker">
    <div className="color-picker-head"><div className="field-title"><Palette size={16}/> 자유 색상 선택</div><div className="color-preview" style={{backgroundColor:value}} title={'선택된 색 '+value}/></div>
    <div className="sv-field" style={{backgroundColor:`hsl(${hue} 100% 50%)`}}
      role="slider" aria-label="색상 밝기 및 채도" tabIndex={0}
      aria-valuetext={`채도 ${Math.round(hsv.s*100)}%, 밝기 ${Math.round(hsv.v*100)}%`}
      onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onKeyDown={e=>{const step=e.shiftKey?0.05:0.01;if(e.key==='ArrowRight')onChange(hsvToHex(hue,clamp(hsv.s+step),hsv.v));else if(e.key==='ArrowLeft')onChange(hsvToHex(hue,clamp(hsv.s-step),hsv.v));else if(e.key==='ArrowUp')onChange(hsvToHex(hue,hsv.s,clamp(hsv.v+step)));else if(e.key==='ArrowDown')onChange(hsvToHex(hue,hsv.s,clamp(hsv.v-step)));else return;e.preventDefault();}}>
      <span className="sv-white"/><span className="sv-black"/>
      <span className="sv-cursor" style={{left:`${hsv.s*100}%`,top:`${(1-hsv.v)*100}%`,backgroundColor:value}}/>
    </div>
    <label className="field-title" htmlFor="color-hue">색상 계열 (Hue)</label>
    <input id="color-hue" className="hue-slider" type="range" min="0" max="359" step="1" value={Math.round(hue)}
      onChange={e=>{const next=Number(e.target.value);setHue(next);onChange(hsvToHex(next,Math.max(hsv.s,0.8),Math.max(hsv.v,0.8)));}}/>
    <div className="hex-row">
      <label htmlFor="ink-hex">HEX 색상 코드</label>
      <div className="hex-field"><span>#</span><input id="ink-hex" aria-label="HEX 색상 코드" value={hexInput.replace(/^#/,'')} maxLength={6} spellCheck={false}
        onChange={e=>{const text=e.target.value.toUpperCase().replace(/[^0-9A-F]/g,'').slice(0,6);setHexInput('#'+text);const c=canonicalHex('#'+text);if(text.length===6&&c)onChange(c);}}
        onBlur={()=>setHexInput(value.toUpperCase())}/></div>
      <button className="secondary-button" onClick={saveColor} title="현재 색상 저장"><BookmarkPlus size={15}/> 저장</button>
    </div>
    <div className="field-title">기본 색상</div>
    <div className="palette-list">{PRESETS.map(c=><button type="button" key={c} className={'swatch '+(value.toUpperCase()===c?'selected':'')} onClick={()=>onChange(c)} style={{backgroundColor:c}} title={c} aria-label={c}>{value.toUpperCase()===c&&<Check size={14} style={{color:c==='#FFFFFF'||c==='#F4D34E'?'#181818':'#ffffff'}}/>}</button>)}</div>
    {saved.length>0&&<><div className="field-title">내가 저장한 색상</div><div className="palette-list">{saved.map(c=><button type="button" key={c} className={'swatch '+(value.toUpperCase()===c?'selected':'')} style={{backgroundColor:c}} title={c} aria-label={'사용자 색상 '+c} onClick={()=>onChange(c)} />)}</div></>}
    <p className="microcopy">색상 영역을 펜·마우스·터치로 드래그하거나 HEX 코드를 입력할 수 있어요.</p>
  </div>;
}
