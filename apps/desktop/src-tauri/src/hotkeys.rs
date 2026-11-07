//! Editable global keyboard shortcuts, synchronized with main UI and toolbar.
use std::{collections::HashSet,str::FromStr,sync::{Mutex,atomic::{AtomicBool,Ordering}}};
use serde::{Serialize,Deserialize};
use tauri::{AppHandle,Emitter,Manager,State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt,Shortcut,ShortcutState};
use crate::bridge::{self,InkTool,InkToolBus,InputMode,DrawingRouteBus,PenStyleBus};
use crate::photoshop::{self,PhotoshopBus,BrushType};

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(default)]
pub struct HotkeyBindings{
    pub save:String,
    pub region:String,
    pub fixed:String,
    pub undo:String,
    pub clear:String,
    pub eraser:String,
    pub mouse:String,
    pub ink:String,
    pub pen:String,
    pub psd:String,
    pub configureRegion:String,
    pub penThinner:String,
    pub penThicker:String,
    pub eraserThinner:String,
    pub eraserThicker:String,
    pub pressure:String,
    pub brush:String,
    pub photoshop:String,
    pub layerAdd:String,
    pub layerPrev:String,
    pub layerNext:String,
    pub layerVisibility:String,
    pub colorNext:String,
    pub toolbarLeft:String,
    pub toolbarRight:String,
    pub routeToggle:String,
}
impl Default for HotkeyBindings{
    fn default()->Self{
        Self{save:"F9".into(),region:"Ctrl+Shift+1".into(),
            fixed:"Ctrl+Shift+2".into(),undo:"F7".into(),clear:"F10".into(),eraser:"F8".into(),
            mouse:String::new(),ink:String::new(),pen:String::new(),psd:String::new(),configureRegion:String::new(),penThinner:String::new(),penThicker:String::new(),eraserThinner:String::new(),eraserThicker:String::new(),pressure:String::new(),brush:String::new(),photoshop:String::new(),layerAdd:String::new(),layerPrev:String::new(),layerNext:String::new(),layerVisibility:String::new(),colorNext:String::new(),toolbarLeft:String::new(),toolbarRight:String::new(),routeToggle:String::new()}
    }
}
impl HotkeyBindings{
    fn entries(&self)->[(&'static str,&str);26]{
        [("save",&self.save),("region",&self.region),("fixed",&self.fixed),
         ("undo",&self.undo),("clear",&self.clear),("eraser",&self.eraser),
         ("mouse",&self.mouse),
         ("ink",&self.ink),
         ("pen",&self.pen),
         ("psd",&self.psd),
         ("configureRegion",&self.configureRegion),
         ("penThinner",&self.penThinner),
         ("penThicker",&self.penThicker),
         ("eraserThinner",&self.eraserThinner),
         ("eraserThicker",&self.eraserThicker),
         ("pressure",&self.pressure),
         ("brush",&self.brush),
         ("photoshop",&self.photoshop),
         ("layerAdd",&self.layerAdd),
         ("layerPrev",&self.layerPrev),
         ("layerNext",&self.layerNext),
         ("layerVisibility",&self.layerVisibility),
         ("colorNext",&self.colorNext),
         ("toolbarLeft",&self.toolbarLeft),
         ("toolbarRight",&self.toolbarRight),
         ("routeToggle",&self.routeToggle)]
    }
}
#[derive(Default)]
pub struct HotkeyBus(pub Mutex<HotkeyBindings>);
#[derive(Default)]
pub struct HotkeyCaptureBus(pub AtomicBool);

/// Temporarily unhook global hotkeys while the settings input captures a
/// combination, so existing F-key shortcuts do not steal keydown events.
#[tauri::command]
pub fn set_hotkey_capture_mode(app:AppHandle,active:bool)->Result<(),String>{
    let capture=app.state::<HotkeyCaptureBus>();
    let was_active=capture.0.swap(active,Ordering::SeqCst);
    if was_active==active{return Ok(());}
    let bindings={
        let state=app.state::<HotkeyBus>();
        let guard=state.0.lock().map_err(|e|e.to_string())?;
        guard.clone()
    };
    let api=app.global_shortcut();
    if active{
        for (_,key) in bindings.entries(){
            if key.is_empty(){continue;}
            if api.is_registered(key){
                api.unregister(key).map_err(|e|format!("단축키 캡처 준비 실패 ({key}): {e}"))?;
            }
        }
    }else{
        for (_,key) in bindings.entries(){
            if key.is_empty(){continue;}
            if !api.is_registered(key){
                api.register(key).map_err(|e|format!("단축키 다시 등록 실패 ({key}): {e}"))?;
            }
        }
    }
    Ok(())
}

fn valid_key(text:&str)->Result<Shortcut,String>{
    if text.is_empty()||text.len()>40{return Err("단축키 길이가 올바르지 않습니다.".into());}
    let parts:Vec<&str>=text.split('+').collect();
    let key=*parts.last().ok_or("단축키 키가 없습니다.")?;
    let function=key.strip_prefix('F').and_then(|n|n.parse::<u8>().ok())
        .is_some_and(|n|(1..=12).contains(&n));
    let letter=key.len()==1&&key.as_bytes()[0].is_ascii_uppercase();
    let number=key.len()==1&&key.as_bytes()[0].is_ascii_digit();
    let mut modifiers=HashSet::new();
    for part in &parts[..parts.len()-1]{
        if !matches!(*part,"Ctrl"|"Alt"|"Shift")||!modifiers.insert(*part){
            return Err("Ctrl, Alt, Shift 조합만 사용할 수 있습니다.".into());
        }
    }
    if !function && !(letter||number){
        return Err("F1~F12 또는 영문/숫자 키를 사용하세요.".into());
    }
    if (letter||number)&&!modifiers.contains("Ctrl")&&!modifiers.contains("Alt"){
        return Err("일반 키는 Ctrl 또는 Alt와 함께 지정하세요.".into());
    }
    if modifiers.contains("Alt")&&key=="F4"{
        return Err("Alt+F4는 Windows 창 닫기 단축키로 예약되어 있습니다.".into());
    }
    Shortcut::from_str(text).map_err(|e|format!("지원하지 않는 단축키 {text}: {e}"))
}
fn validate(bindings:&HotkeyBindings)->Result<(),String>{
    let mut used=HashSet::new();
    for (action,value) in bindings.entries(){
        if value.is_empty(){continue;}
        let parsed=valid_key(value)?;
        if !used.insert(parsed.id()){
            return Err(format!("{action} 단축키가 다른 동작과 중복됩니다."));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_hotkeys(state:State<'_,HotkeyBus>)->Result<HotkeyBindings,String>{
    let bindings={
        let guard=state.0.lock().map_err(|e|e.to_string())?;
        guard.clone()
    };
    Ok(bindings)
}

#[tauri::command]
pub fn set_hotkeys(app:AppHandle,bindings:HotkeyBindings)->Result<(),String>{
    validate(&bindings)?;
    let state=app.state::<HotkeyBus>();
    let mut guard=state.0.lock().map_err(|e|e.to_string())?;
    if *guard==bindings{return Ok(());}
    if app.state::<HotkeyCaptureBus>().0.load(Ordering::SeqCst){
        return Err("단축키 입력 중입니다. 키 입력을 마친 뒤 다시 설정하세요.".into());
    }
    let previous=guard.clone();
    let api=app.global_shortcut();
    // Completely swap the registration set, including remapping two actions
    // to each other's previous keys without an artificial collision.
    for (_,key) in previous.entries(){
        if key.is_empty(){continue;}
        if api.is_registered(key){
            api.unregister(key).map_err(|e|format!("기존 단축키 해제 실패 ({key}): {e}"))?;
        }
    }
    let mut added=Vec::new();
    for (_,key) in bindings.entries(){
            if key.is_empty(){continue;}
        if let Err(error)=api.register(key){
            for value in added{let _=api.unregister(value);}
            for (_,old_key) in previous.entries(){
                if old_key.is_empty(){continue;}
                if !api.is_registered(old_key){let _=api.register(old_key);}
            }
            return Err(format!("단축키 {key} 등록 실패 (다른 앱에서 사용 중일 수 있습니다): {error}"));
        }
        added.push(key);
    }
    *guard=bindings.clone();
    let _=app.emit("hotkeys-updated",bindings);
    Ok(())
}

pub fn initialize(app:&AppHandle){
    let defaults=HotkeyBindings::default();
    for (_,key) in defaults.entries(){
        if key.is_empty(){continue;}
        if let Err(error)=app.global_shortcut().register(key){
            eprintln!("PenStudy global shortcut registration failed ({key}): {error}");
        }
    }
}

pub fn handle_pressed(app:&AppHandle,shortcut:&Shortcut,event:ShortcutState){
    if event!=ShortcutState::Pressed{return;}
    if app.state::<HotkeyCaptureBus>().0.load(Ordering::SeqCst){return;}
    // Keep the State alive until the MutexGuard has been cloned and dropped.
    let state=app.state::<HotkeyBus>();
    let guard=match state.0.lock(){
        Ok(guard)=>guard,
        Err(_)=>return,
    };
    let bindings=guard.clone();
    drop(guard);
    for (name,key) in bindings.entries(){
        if key.is_empty(){continue;}
        if Shortcut::from_str(key).is_ok_and(|binding|&binding==shortcut){
            match name{
                "save"=>{let _=app.emit("capture-requested",());},
                "region"=>{let _=app.emit("capture-region-requested",());},
                "fixed"=>{let _=app.emit("capture-fixed-requested",());},
                "undo"=>{let _=app.emit("undo-requested",());},
                "clear"=>{let _=app.emit("clear-requested",());},
                "eraser"=>{
                    let ink_state=app.state::<InkToolBus>();
                    let current=*ink_state.0.borrow();
                    bridge::apply_input_mode(app,InputMode::Ink);
                    bridge::apply_ink_tool(app,if current==InkTool::Eraser{InkTool::Pen}else{InkTool::Eraser});
                },

                "mouse"=>bridge::apply_input_mode(app,InputMode::Mouse),
                "ink"=>bridge::apply_input_mode(app,InputMode::Ink),
                "pen"=>{
                    bridge::apply_input_mode(app,InputMode::Ink);
                    bridge::apply_ink_tool(app,InkTool::Pen);
                },
                "psd"=>{let _=app.emit("psd-requested",());},
                "configureRegion"=>{let _=app.emit("capture-configure-region-requested",());},
                "penThinner"|"penThicker"|"eraserThinner"|"eraserThicker"|
                "pressure"|"colorNext"=>{
                    let state=app.state::<PenStyleBus>();
                    let mut style=state.0.borrow().clone();
                    match name{
                        "penThinner"=>style.width=(style.width-1.0).max(1.0),
                        "penThicker"=>style.width=(style.width+1.0).min(20.0),
                        "eraserThinner"=>style.eraser_width=(style.eraser_width-4.0).max(4.0),
                        "eraserThicker"=>style.eraser_width=(style.eraser_width+4.0).min(512.0),
                        "pressure"=>style.pressure_enabled=!style.pressure_enabled,
                        "colorNext"=>{
                            let palette=["#4DBEFF","#FFFFFF","#FCA5A5","#FDE68A",
                                "#86EFAC","#C4B5FD","#000000","#FF7D36"];
                            let idx=palette.iter().position(|c|c.eq_ignore_ascii_case(&style.color));
                            style.color=palette[idx.map(|i|(i+1)%palette.len()).unwrap_or(0)].to_string();
                        },
                        _=>{}
                    }
                    let _=bridge::apply_pen_style(app,style);
                },
                "brush"|"photoshop"|"layerAdd"|"layerPrev"|"layerNext"|"layerVisibility"=>{
                    let state=app.state::<PhotoshopBus>().0.borrow().clone();
                    let id=state.active_layer_id.clone();
                    let mut action=String::new();
                    let mut layer_id=None;
                    let mut enabled=None;
                    let mut brush=None;
                    match name{
                        "photoshop"=>{action="enable".into();enabled=Some(!state.enabled);},
                        "brush"=>{
                            action="brush".into();
                            brush=Some(match state.brush{
                                BrushType::Solid=>BrushType::Marker,
                                BrushType::Marker=>BrushType::Pencil,
                                BrushType::Pencil=>BrushType::Airbrush,
                                BrushType::Airbrush=>BrushType::Solid
                            });
                        },
                        "layerAdd"=>{action="add".into();},
                        "layerPrev"|"layerNext"=>{
                            if !state.enabled{break;}
                            let idx=state.layers.iter().position(|l|l.id==id).unwrap_or(0);
                            let len=state.layers.len();
                            if len==0{break;}
                            let next=if name=="layerNext"{(idx+1)%len}else{(idx+len-1)%len};
                            action="select".into();
                            layer_id=Some(state.layers[next].id.clone());
                        },
                        "layerVisibility"=>{
                            if !state.enabled{break;}
                            let visible=state.layers.iter().find(|l|l.id==id)
                                .is_some_and(|l|l.visible);
                            action=if visible{"hide".into()}else{"show".into()};
                            layer_id=Some(id);
                        },
                        _=>{}
                    }
                    let _=photoshop::edit_photoshop(
                        app.clone(),action,layer_id,None,enabled,brush);
                },
                "toolbarLeft"=>{let _=app.emit("toolbar-control-requested","reset:left");},
                "toolbarRight"=>{let _=app.emit("toolbar-control-requested","reset:right");},
                "routeToggle"=>{
                    let enabled=*app.state::<DrawingRouteBus>().0.borrow();
                    bridge::apply_auto_canvas_routing(app,!enabled);
                },
                _=>{}
            }
            break;
        }
    }
}
