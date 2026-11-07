/** Shared desktop/mobile pen style and input-coordinate rules. */
export const ERASER_MIN_WIDTH=4;
export const ERASER_MAX_WIDTH=512;
export const ERASER_WIDTH=64;
export type PenStyle = {
  color: string;
  width: number;
  eraserWidth: number;
  pressureEnabled: boolean;
  pressureSensitivity: number;
};
export const DEFAULT_PEN_STYLE:PenStyle={
  color:'#4DBEFF',width:4,eraserWidth:ERASER_WIDTH,pressureEnabled:true,pressureSensitivity:1.4
};
export type InkTool = 'pen'|'eraser';
/** Eraser strokes are transparent and sized independently from pen strokes. */
export type Rotation = 'auto'|'left'|'right';
export type InkPoint={x:number;y:number;pressure:number};
export const clamp01=(v:number)=>Math.min(1,Math.max(0,Number.isFinite(v)?v:0));
export function validStyle(value:unknown): value is PenStyle{
  if(!value||typeof value!=='object')return false;
  const s=value as Record<string,unknown>;
  return typeof s.color==='string'&&/^#[0-9A-Fa-f]{6}$/.test(s.color)&&
    typeof s.width==='number'&&Number.isFinite(s.width)&&s.width>=1&&s.width<=20&&
    typeof s.eraserWidth==='number'&&Number.isFinite(s.eraserWidth)&&
    s.eraserWidth>=ERASER_MIN_WIDTH&&s.eraserWidth<=ERASER_MAX_WIDTH&&
    typeof s.pressureEnabled==='boolean'&&
    typeof s.pressureSensitivity==='number'&&Number.isFinite(s.pressureSensitivity)&&
    s.pressureSensitivity>=0.5&&s.pressureSensitivity<=3;
}
/** Only use rotation when Android does not rotate the WebView correctly. */
export function orientedPoint(point:InkPoint,rotation:Rotation):InkPoint{
  const x=clamp01(point.x),y=clamp01(point.y),pressure=clamp01(point.pressure);
  if(rotation==='left')return {x:y,y:1-x,pressure};
  if(rotation==='right')return {x:1-y,y:x,pressure};
  return {x,y,pressure};
}
/** Expand the stylus pressure range so light/heavy strokes visibly differ. */
export function pressureWidth(width:number,pressure:number,enabled=true,sensitivity=1.4):number{
  if(!enabled)return width;
  const value=Math.pow(clamp01(pressure),sensitivity);
  return Math.max(0.45,width*(0.12+1.6*value));
}
