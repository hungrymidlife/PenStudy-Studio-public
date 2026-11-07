//! Authorized Photoshop-mode layer state mirrored to desktop and mobile.
use serde::{Serialize,Deserialize};
use tauri::{AppHandle,Emitter,Manager,State};
use tokio::sync::watch;
use uuid::Uuid;

#[derive(Clone,Copy,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="kebab-case")]
pub enum BrushType { Solid, Marker, Pencil, Airbrush }
impl Default for BrushType {fn default()->Self{Self::Solid}}

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase")]
pub struct LayerInfo {
    pub id:String,
    pub name:String,
    pub visible:bool,
}

#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct PhotoshopState {
    pub enabled:bool,
    pub layers:Vec<LayerInfo>, // bottom to top, as displayed in overlay
    pub active_layer_id:String,
    pub brush:BrushType,
}
impl Default for PhotoshopState {
    fn default()->Self{
        Self{
            enabled:false,
            layers:vec![LayerInfo{id:"base".into(),name:"필기 레이어 1".into(),visible:true}],
            active_layer_id:"base".into(),
            brush:BrushType::Solid,
        }
    }
}
pub struct PhotoshopBus(pub watch::Sender<PhotoshopState>);
impl Default for PhotoshopBus{
    fn default()->Self{
        let (sender,_)=watch::channel(PhotoshopState::default());
        Self(sender)
    }
}
#[tauri::command]
pub fn get_photoshop(state:State<'_,PhotoshopBus>)->PhotoshopState{state.0.borrow().clone()}

#[tauri::command]
pub fn edit_photoshop(app:AppHandle,action:String,
    id:Option<String>,name:Option<String>,enabled:Option<bool>,
    brush:Option<BrushType>)->Result<PhotoshopState,String>{
    let bus=app.state::<PhotoshopBus>();
    let mut next=bus.0.borrow().clone();
    match action.as_str(){
        "enable"=>{
            next.enabled=enabled.ok_or("모드 상태가 누락되었습니다.")?;
        },
        "brush"=>{
            next.brush=brush.ok_or("브러시 타입이 누락되었습니다.")?;
        },
        "add"=>{
            if next.layers.len()>=24{return Err("레이어는 최대 24개입니다.".into());}
            let new_id=Uuid::new_v4().simple().to_string();
            let index=next.layers.iter().position(|l|l.id==next.active_layer_id)
                .map(|i|i+1).unwrap_or(next.layers.len());
            let layer_name=format!("레이어 {}",next.layers.len()+1);
            next.layers.insert(index,LayerInfo{
                id:new_id.clone(),
                name:layer_name,
                visible:true,
            });
            next.active_layer_id=new_id;
        },
        "select"|"hide"|"show"|"rename"|"delete"|"up"|"down"=>{
            let id=id.as_deref().ok_or("레이어 ID가 누락되었습니다.")?;
            let index=next.layers.iter().position(|l|l.id==id)
                .ok_or("레이어를 찾지 못했습니다.")?;
            match action.as_str(){
                "select"=>next.active_layer_id=id.to_string(),
                "hide"=>next.layers[index].visible=false,
                "show"=>next.layers[index].visible=true,
                "rename"=>{
                    let label=name.as_deref().unwrap_or("").trim();
                    if label.is_empty()||label.chars().count()>40{
                        return Err("레이어 이름은 1~40자로 입력하세요.".into());
                    }
                    next.layers[index].name=label.to_string();
                },
                "delete"=>{
                    if next.layers.len()==1{return Err("마지막 레이어는 삭제할 수 없습니다.".into());}
                    next.layers.remove(index);
                    if next.active_layer_id==id{
                        next.active_layer_id=next.layers[index.saturating_sub(1).min(next.layers.len()-1)].id.clone();
                    }
                },
                "up"=>{if index+1<next.layers.len(){next.layers.swap(index,index+1);}},
                "down"=>{if index>0{next.layers.swap(index,index-1);}},
                _=>{}
            }
        },
        _=>return Err("지원하지 않는 레이어 명령입니다.".into())
    };
    bus.0.send_replace(next.clone());
    let _=app.emit("photoshop-state-changed",&next);
    if action=="enable" && next.enabled{
        crate::bridge::apply_input_mode(&app,crate::bridge::InputMode::Ink);
    }
    Ok(next)
}
