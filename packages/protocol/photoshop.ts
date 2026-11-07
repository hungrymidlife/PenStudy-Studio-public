/** Shared Photoshop-mode protocol, consistent with Rust PhotoshopState. */
export type BrushType='solid'|'marker'|'pencil'|'airbrush';
export type LayerInfo={id:string;name:string;visible:boolean};
export type PhotoshopState={
  enabled:boolean;
  layers:LayerInfo[]; // bottom to top
  activeLayerId:string;
  brush:BrushType;
};
export const BRUSH_OPTIONS:ReadonlyArray<{value:BrushType;label:string}>=
  [{value:'solid',label:'일반 펜'},
   {value:'marker',label:'형광 마커'},
   {value:'pencil',label:'연필'},
   {value:'airbrush',label:'에어브러시'}];
export const DEFAULT_PHOTOSHOP:PhotoshopState={
  enabled:false,
  layers:[{id:'base',name:'필기 레이어 1',visible:true}],
  activeLayerId:'base',
  brush:'solid'
};
export const WHITE_BACKGROUND='#FFFFFF';
export function validBackgroundColor(value:unknown):value is string{
  return typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value);
}
export function isBrushType(value:unknown):value is BrushType{
  return BRUSH_OPTIONS.some(x=>x.value===value);
}
