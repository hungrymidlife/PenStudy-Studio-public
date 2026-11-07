/** User-editable Windows global shortcuts. No HTML keydown listener is used to trigger them. */
export type HotkeyAction=
  'save'|'region'|'fixed'|'undo'|'clear'|'eraser'|
  'mouse'|'ink'|'pen'|'psd'|'configureRegion'|
  'penThinner'|'penThicker'|'eraserThinner'|'eraserThicker'|
  'pressure'|'brush'|'photoshop'|'layerAdd'|'layerPrev'|'layerNext'|
  'layerVisibility'|'colorNext'|'toolbarLeft'|'toolbarRight'|'routeToggle';
export type HotkeyBindings=Record<HotkeyAction,string>;
export const DEFAULT_HOTKEYS:HotkeyBindings={
  save:'F9',region:'Ctrl+Shift+1',fixed:'Ctrl+Shift+2',
  undo:'F7',clear:'F10',eraser:'F8',
  // Unassigned by default to avoid stealing shortcuts from other apps.
  mouse:'',ink:'',pen:'',psd:'',configureRegion:'',
  penThinner:'',penThicker:'',eraserThinner:'',eraserThicker:'',
  pressure:'',brush:'',photoshop:'',layerAdd:'',layerPrev:'',layerNext:'',
  layerVisibility:'',colorNext:'',toolbarLeft:'',toolbarRight:'',routeToggle:''
};
const STORAGE_KEY='penstudy.hotkeys.v1';

export function validHotkey(key:string):boolean{
  if(!key||key.length>40)return false;
  const parts=key.split('+');
  const trigger=parts[parts.length-1];
  const modifiers=parts.slice(0,-1);
  if(new Set(modifiers).size!==modifiers.length ||
     modifiers.some(m=>!['Ctrl','Alt','Shift'].includes(m)))return false;
  const isFunction=/^F(?:[1-9]|1[0-2])$/.test(trigger);
  const isPrintable=/^[A-Z0-9]$/.test(trigger);
  if(!isFunction&&!isPrintable)return false;
  if(isPrintable&&!modifiers.some(m=>m==='Ctrl'||m==='Alt'))return false;
  if(modifiers.includes('Alt')&&trigger==='F4')return false;
  return true;
}

export function validHotkeyBindings(value:HotkeyBindings):boolean{
  const keys=Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[];
  const items=keys.map(k=>value[k]);
  return items.every(x=>typeof x==='string'&&(x===''||validHotkey(x))) &&
    new Set(items.filter(Boolean)).size===items.filter(Boolean).length;
}

export function captureHotkey(event:{
  key:string;code?:string;ctrlKey:boolean;altKey:boolean;shiftKey:boolean;metaKey:boolean;
}):string|null{
  if(event.metaKey)return null; // Avoid intercepting Windows system shortcuts.
  // Physical codes also work while the Korean IME is active or Shift+digit
  // produces punctuation (e.g. ! instead of 1).
  const code=event.code??'';
  const physical=/^Key([A-Z])$/.exec(code)?.[1]??/^Digit([0-9])$/.exec(code)?.[1];
  const trigger=physical??event.key.toUpperCase();
  if(!/^(?:F(?:[1-9]|1[0-2])|[A-Z0-9])$/.test(trigger))return null;
  const mods=[event.ctrlKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':''].filter(Boolean);
  const candidate=[...mods,trigger].join('+');
  return validHotkey(candidate)?candidate:null;
}

export function loadHotkeys():HotkeyBindings{
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null');
    const result={...DEFAULT_HOTKEYS,...saved} as HotkeyBindings;
    return validHotkeyBindings(result)?result:{...DEFAULT_HOTKEYS};
  }catch{return {...DEFAULT_HOTKEYS};}
}
export function storeHotkeys(bindings:HotkeyBindings){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(bindings));
}
