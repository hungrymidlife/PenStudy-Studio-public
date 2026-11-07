/**
 * Layer-scoped edit history for both normal overlay and Photoshop mode.
 * Each eraser stroke belongs to one layer, just like paint strokes. A clear
 * operation only touches its explicit layer (or all layers in legacy mode).
 * Undo can target the selected layer without mutating other layers.
 */
export type LayerTagged={layerId:string};
type Removed<T>=Readonly<{index:number;stroke:T}>;
type Edit<T extends LayerTagged>=
  |{kind:'stroke';layerId:string;stroke:T}
  |{kind:'clear';layerId:string|null;removed:ReadonlyArray<Removed<T>>};

export class LayerInkHistory<T extends LayerTagged>{
  private data:T[]=[];
  private edits:Edit<T>[]=[];
  get strokes():readonly T[]{return this.data;}
  get length(){return this.data.length;}
  add(stroke:T){
    this.data.push(stroke);
    this.edits.push({kind:'stroke',layerId:stroke.layerId,stroke});
  }
  clear(layerId:string|null):number{
    const removed=this.data.flatMap((stroke,index)=>
      layerId===null||stroke.layerId===layerId?[{index,stroke}]:[]);
    if(removed.length===0)return 0;
    this.data=this.data.filter(stroke=>layerId!==null&&stroke.layerId!==layerId);
    this.edits.push({kind:'clear',layerId,removed});
    return removed.length;
  }
  undo(layerId:string|null):boolean{
    let index=-1;
    for(let i=this.edits.length-1;i>=0;i--){
      const edit=this.edits[i];
      if(layerId===null||edit.layerId===layerId){index=i;break;}
    }
    if(index<0)return false;
    const [edit]=this.edits.splice(index,1);
    if(edit.kind==='stroke'){
      const strokeIndex=this.data.lastIndexOf(edit.stroke);
      if(strokeIndex>=0)this.data.splice(strokeIndex,1);
    }else{
      for(const {index:original,stroke} of edit.removed){
        this.data.splice(Math.min(original,this.data.length),0,stroke);
      }
    }
    return true;
  }
  dropLayer(id:string){
    this.data=this.data.filter(stroke=>stroke.layerId!==id);
    this.edits=this.edits.flatMap((edit):Edit<T>[]=>{
      if(edit.layerId===id)return[];
      if(edit.kind==='clear'){
        const removed=edit.removed.filter(({stroke})=>stroke.layerId!==id);
        return removed.length?[{...edit,removed}]:[];
      }
      return [edit];
    });
  }
  reset(){this.data=[];this.edits=[];}
}
