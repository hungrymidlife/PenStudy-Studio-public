import {DEFAULT_PEN_STYLE,type PenStyle} from '../../../packages/protocol/ink';
export type PenSettings=PenStyle&{outputFolder:string;autoCanvasRouting:boolean};
export const DEFAULT_SETTINGS:PenSettings={...DEFAULT_PEN_STYLE,outputFolder:'',autoCanvasRouting:true};
const KEY='penstudy.settings.v1';
export function loadSettings():PenSettings{
  try {return {...DEFAULT_SETTINGS,...JSON.parse(localStorage.getItem(KEY)??'{}')}}
  catch{return {...DEFAULT_SETTINGS}}
}
export function storeSettings(settings:PenSettings){localStorage.setItem(KEY,JSON.stringify(settings));}
