const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));
export function canonicalHex(input:string):string|null{
  const v=input.trim().replace(/^#/,'');
  if(/^[0-9a-fA-F]{3}$/.test(v)) return '#'+[...v].map(c=>c+c).join('').toUpperCase();
  if(/^[0-9a-fA-F]{6}$/.test(v)) return '#'+v.toUpperCase();
  return null;
}
export function hexToHsv(hex:string){
  const safe=canonicalHex(hex)??'#FFFFFF';
  const r=parseInt(safe.slice(1,3),16)/255,g=parseInt(safe.slice(3,5),16)/255,b=parseInt(safe.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  let h=0;
  if(delta>0){
    if(max===r)h=((g-b)/delta)%6;
    else if(max===g)h=(b-r)/delta+2;
    else h=(r-g)/delta+4;
    h=(h*60+360)%360;
  }
  return {h,s:max===0?0:delta/max,v:max};
}
export function hsvToHex(h:number,s:number,v:number){
  h=((h%360)+360)%360;s=clamp(s);v=clamp(v);
  const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return '#'+[r,g,b].map(channel=>Math.round((channel+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
