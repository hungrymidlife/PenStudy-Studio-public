import {LayerInkHistory} from '../../../packages/protocol/layerHistory';
import {pressureWidth,type InkPoint,type InkTool,type PenStyle} from '../../../packages/protocol/ink';
import {DEFAULT_PHOTOSHOP,type BrushType,type PhotoshopState} from '../../../packages/protocol/photoshop';

export type PreviewStroke={
  layerId:string;tool:InkTool;brush:BrushType;style:PenStyle;points:InkPoint[];
};
/** Preview only. The authenticated Windows overlay remains the document source. */
export class MobileLayerPreview{
  readonly history=new LayerInkHistory<PreviewStroke>();
  private canvas:HTMLCanvasElement|null=null;
  private layers=new Map<string,HTMLCanvasElement>();
  private current:PreviewStroke|null=null;
  private photoshop:PhotoshopState=DEFAULT_PHOTOSHOP;
  private monitorWidth=1920;

  attach(canvas:HTMLCanvasElement|null,monitorWidth:number){
    const previousWidth=this.monitorWidth;
    this.canvas=canvas;
    this.monitorWidth=Math.max(1,monitorWidth);
    if(canvas){
      this.resize();
      if(previousWidth!==this.monitorWidth)this.render();
    }
  }
  resize(){
    const canvas=this.canvas;
    if(!canvas)return;
    const dpr=window.devicePixelRatio||1;
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.round(rect.width*dpr));
    const height=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==width||canvas.height!==height){
      canvas.width=width;canvas.height=height;
      this.render();
    }
  }
  updatePhotoshop(next:PhotoshopState){
    const ids=new Set(next.layers.map(layer=>layer.id));
    for(const layer of this.photoshop.layers){
      if(!ids.has(layer.id))this.history.dropLayer(layer.id);
    }
    // Keep the same stroke's source layer when switching tools/layers;
    // pending further points are discarded until the next pen-down.
    this.current=null;
    this.photoshop=next;
    this.render();
  }
  reset(){
    this.current=null;
    this.history.reset();
    this.render();
  }
  begin(layerId:string,tool:InkTool,brush:BrushType,style:PenStyle,point:InkPoint){
    const layer=this.photoshop.layers.find(l=>l.id===layerId);
    if(this.photoshop.enabled&&(!layer||!layer.visible))return;
    const stroke:PreviewStroke={layerId,tool,brush,style:{...style},points:[]};
    this.history.add(stroke);this.current=stroke;
    this.point(point);
  }
  point(point:InkPoint,compositeNow=true){
    const stroke=this.current;
    if(!stroke)return;
    const previous=stroke.points[stroke.points.length-1];
    stroke.points.push(point);
    const target=this.surface(stroke.layerId).getContext('2d');
    if(!target)return;
    this.paint(target,stroke,point,previous);
    if(compositeNow)this.composite();
  }
  points(batch:InkPoint[]){
    for(const point of batch)this.point(point,false);
    if(batch.length)this.composite();
  }
  end(){this.current=null;}
  clear(){
    this.current=null;
    this.history.clear(this.photoshop.enabled?this.photoshop.activeLayerId:null);
    this.render();
  }
  undo(){
    this.current=null;
    this.history.undo(this.photoshop.enabled?this.photoshop.activeLayerId:null);
    this.render();
  }
  private surface(id:string){
    let result=this.layers.get(id);
    if(!result){
      result=document.createElement('canvas');
      result.width=this.canvas?.width??1;
      result.height=this.canvas?.height??1;
      this.layers.set(id,result);
    }
    return result;
  }
  private paint(ctx:CanvasRenderingContext2D,stroke:PreviewStroke,
    point:InkPoint,previous?:InkPoint){
    const canvas=this.canvas;
    if(!canvas)return;
    const w=canvas.width,h=canvas.height;
    const size=stroke.tool==='eraser'
      ?stroke.style.eraserWidth
      :pressureWidth(stroke.style.width,point.pressure,
        stroke.style.pressureEnabled,stroke.style.pressureSensitivity);
    const diameter=Math.max(1,size*w/this.monitorWidth)*
      (stroke.tool==='eraser'?1:stroke.brush==='marker'?3:
        stroke.brush==='pencil'?.7:stroke.brush==='airbrush'?2.8:1);
    ctx.save();
    ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';
    ctx.globalAlpha=stroke.tool==='eraser'?1:
      stroke.brush==='marker'?.34:stroke.brush==='pencil'?.8:1;
    ctx.fillStyle=stroke.tool==='eraser'?'#000':stroke.style.color;
    ctx.strokeStyle=ctx.fillStyle;
    ctx.lineWidth=diameter;
    ctx.lineCap='round';ctx.lineJoin='round';
    if(stroke.tool==='pen'&&stroke.brush==='airbrush'){
      ctx.shadowColor=stroke.style.color;
      ctx.shadowBlur=diameter*.7;
    }
    if(!previous){
      ctx.beginPath();ctx.arc(point.x*w,point.y*h,diameter/2,0,Math.PI*2);ctx.fill();
    }else{
      ctx.beginPath();ctx.moveTo(previous.x*w,previous.y*h);ctx.lineTo(point.x*w,point.y*h);ctx.stroke();
    }
    ctx.restore();
  }
  private composite(){
    const canvas=this.canvas;
    const ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const layer of this.photoshop.layers){
      if(!layer.visible)continue;
      const data=this.layers.get(layer.id);
      if(data)ctx.drawImage(data,0,0);
    }
  }
  render(){
    this.layers.clear();
    for(const stroke of this.history.strokes){
      const target=this.surface(stroke.layerId).getContext('2d');
      if(!target)continue;
      let previous:InkPoint|undefined;
      for(const point of stroke.points){
        this.paint(target,stroke,point,previous);
        previous=point;
      }
    }
    this.composite();
  }
}
