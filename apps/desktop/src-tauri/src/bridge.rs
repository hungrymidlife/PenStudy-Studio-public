//! Authenticated local S Pen relay, including live pen-style synchronization.
use std::{sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex}, time::{Duration,Instant}};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{net::{TcpListener, TcpStream}, sync::{broadcast,watch}};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use crate::{desktop_mouse,photoshop::{self,PhotoshopBus,BrushType}};

const PORT:u16=39871;

pub struct BridgeServer {
    pub shutdown:watch::Sender<bool>,
    pub task:tokio::task::JoinHandle<()>,
    pub info:BridgeInfo,
}
#[derive(Default)]
pub struct BridgeState(pub Mutex<Option<BridgeServer>>);

#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct BridgeInfo {pub running:bool,pub lan:bool,pub port:u16,pub token:String}

#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct PenStyle {
    pub color:String,
    pub width:f64,
    #[serde(default="default_eraser_width")]
    pub eraser_width:f64,
    pub pressure_enabled:bool,
    pub pressure_sensitivity:f64,
}
fn default_eraser_width()->f64{64.0}
impl Default for PenStyle {
    fn default()->Self {
        Self{color:"#4DBEFF".into(),width:4.0,eraser_width:64.0,
            pressure_enabled:true,pressure_sensitivity:1.4}
    }
}
impl PenStyle {
    pub fn valid(&self)->bool {
        self.color.len()==7 && self.color.starts_with('#') &&
        self.color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit) &&
        self.width.is_finite() && (1.0..=20.0).contains(&self.width) &&
        self.eraser_width.is_finite() && (4.0..=512.0).contains(&self.eraser_width) &&
        self.pressure_sensitivity.is_finite() && (0.5..=3.0).contains(&self.pressure_sensitivity)
    }
}
pub struct PenStyleBus(pub watch::Sender<PenStyle>);
impl Default for PenStyleBus {
    fn default()->Self {let (sender,_receiver)=watch::channel(PenStyle::default()); Self(sender)}
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InputMode { Mouse, Ink }
impl Default for InputMode {fn default()->Self{Self::Mouse}}
pub struct InputModeBus(pub watch::Sender<InputMode>);
impl Default for InputModeBus{
    fn default()->Self{let (sender,_receiver)=watch::channel(InputMode::default()); Self(sender)}
}
pub fn apply_input_mode(app:&AppHandle,mode:InputMode) {
    app.state::<InputModeBus>().0.send_replace(mode);
    let _=app.emit("input-mode-changed",mode);
}
#[tauri::command]
pub fn get_input_mode(state:State<'_,InputModeBus>)->InputMode{*state.0.borrow()}
#[tauri::command]
pub fn set_input_mode(app:AppHandle,mode:InputMode)->Result<(),String>{
    apply_input_mode(&app,mode);
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all="lowercase")]
pub enum InkTool { Pen, Eraser }
impl Default for InkTool {fn default()->Self{Self::Pen}}
pub struct InkToolBus(pub watch::Sender<InkTool>);

/// When enabled, ink strokes target a supported foreground painting app via
/// Windows mouse input instead of the PenStudy annotation overlay.
pub struct DrawingRouteBus(pub watch::Sender<bool>);
impl Default for DrawingRouteBus{
    fn default()->Self{
        let (sender,_)=watch::channel(true);
        Self(sender)
    }
}
#[tauri::command]
pub fn get_auto_canvas_routing(state:State<'_,DrawingRouteBus>)->bool{
    *state.0.borrow()
}
pub fn apply_auto_canvas_routing(app:&AppHandle,enabled:bool){
    app.state::<DrawingRouteBus>().0.send_replace(enabled);
    let _=app.emit("auto-canvas-routing-changed",enabled);
}
#[tauri::command]
pub fn set_auto_canvas_routing(app:AppHandle,enabled:bool){
    apply_auto_canvas_routing(&app,enabled);
}
impl Default for InkToolBus {
    fn default()->Self{
        let (sender,_receiver)=watch::channel(InkTool::default());
        Self(sender)
    }
}
pub fn apply_ink_tool(app:&AppHandle,tool:InkTool){
    app.state::<InkToolBus>().0.send_replace(tool);
    let _=app.emit("ink-tool-changed",tool);
}
#[tauri::command]
pub fn get_ink_tool(state:State<'_,InkToolBus>)->InkTool{*state.0.borrow()}
#[tauri::command]
pub fn set_ink_tool(app:AppHandle,tool:InkTool)->Result<(),String>{
    apply_ink_tool(&app,tool);
    Ok(())
}

pub struct ActionBus(pub broadcast::Sender<&'static str>);
impl Default for ActionBus {
    fn default()->Self {let (sender,_receiver)=broadcast::channel(32);Self(sender)}
}
pub fn apply_pen_style(app:&AppHandle, style:PenStyle)->Result<(),String>{
    if !style.valid(){return Err("Invalid pen style".into());}
    app.state::<PenStyleBus>().0.send_replace(style.clone());
    let _=app.emit("pen-style-changed",style);
    Ok(())
}
#[tauri::command]
pub fn get_pen_style(state:State<'_,PenStyleBus>)->PenStyle {
    state.0.borrow().clone()
}
#[tauri::command]
pub fn set_pen_style(app:AppHandle,style:PenStyle)->Result<(),String>{
    apply_pen_style(&app,style)
}
#[tauri::command]
pub fn bridge_status(state:State<'_,BridgeState>)->Result<BridgeInfo,String>{
    Ok(state.0.lock().map_err(|e|e.to_string())?
        .as_ref().map(|s|s.info.clone())
        .unwrap_or(BridgeInfo{running:false,lan:false,port:PORT,token:String::new()}))
}
#[tauri::command]
pub async fn start_bridge(app:AppHandle,state:State<'_,BridgeState>,lan:bool)->Result<BridgeInfo,String>{
    if state.0.lock().map_err(|e|e.to_string())?.is_some(){return Err("이미 서버가 실행 중입니다.".into());}
    let host=if lan {"0.0.0.0"} else {"127.0.0.1"};
    let listener=TcpListener::bind((host,PORT)).await.map_err(|e|{
        if e.kind()==std::io::ErrorKind::AddrInUse {
            format!("입력 서버 {PORT} 포트 사용 중. 이전 PenStudy 실행 프로세스가 종료되지 않았는지 확인하세요.")
        } else {format!("{host}:{PORT} 포트 열기 실패: {e}")}
    })?;
    let token=uuid::Uuid::new_v4().simple().to_string();
    let info=BridgeInfo{running:true,lan,port:PORT,token:token.clone()};
    let (shutdown,mut rx)=watch::channel(false);
    let app_for_server=app.clone();
    let occupied=Arc::new(AtomicBool::new(false));
    let task=tokio::spawn(async move {
        loop {
            tokio::select! {
                _=rx.changed()=>break,
                incoming=listener.accept()=>{
                    if let Ok((stream,_))=incoming {
                        let _=app_for_server.emit("bridge-connection-detail","모바일 TCP 접속이 PC 서버에 도착했습니다. 인증 확인 중…");
                        let app=app_for_server.clone();
                        let token=token.clone();
                        let occupied=occupied.clone();
                        let child_rx=rx.clone();
                        tokio::spawn(async move {process_client(stream,app,token,occupied,child_rx).await;});
                    }
                }
            }
        }
    });
    *state.0.lock().map_err(|e|e.to_string())?=Some(BridgeServer{shutdown,task,info:info.clone()});
    let _=app.emit("bridge-status",&info);
    Ok(info)
}
#[tauri::command]
pub async fn stop_bridge(app:AppHandle,state:State<'_,BridgeState>)->Result<(),String>{
    // The listener must finish before the UI can start the server again.
    // Otherwise the previous listener may still occupy TCP port 39871.
    let server={
        let mut guard=state.0.lock().map_err(|e|e.to_string())?;
        guard.take()
    };
    if let Some(mut server)=server{
        let _=server.shutdown.send(true);
        if tokio::time::timeout(Duration::from_secs(2),&mut server.task).await.is_err(){
            server.task.abort();
            let _=server.task.await;
        }
    }
    let _=app.emit("bridge-status",json!({"running":false,"lan":false,"port":PORT,"token":""}));
    Ok(())
}

/// Called synchronously when the main desktop window is closed.
/// All sockets also close when the desktop process exits.
pub fn stop_bridge_on_exit(app:&AppHandle){
    // Do not let an interrupted S Pen drag leave the Windows button held.
    let _=desktop_mouse::left_button(false);
    let state=app.state::<BridgeState>();
    if let Ok(mut guard)=state.0.lock(){
        if let Some(server)=guard.take(){
            let _=server.shutdown.send(true);
            server.task.abort();
        }
    };
}

fn monitor_dimensions(app:&AppHandle)->(u32,u32){
    match app.primary_monitor(){Ok(Some(m))=>(m.size().width,m.size().height),_=>(1920,1080)}
}
async fn process_client(stream:TcpStream,app:AppHandle,expected_token:String,
    occupied:Arc<AtomicBool>,mut shutdown:watch::Receiver<bool>){
    // Disable Nagle; S Pen packets should not wait for TCP aggregation.
    let _=stream.set_nodelay(true);
    let Ok(mut ws)=accept_async(stream).await else{
        let _=app.emit("bridge-connection-detail","TCP 접속은 도착했지만 WebSocket 핸드셰이크에 실패했습니다.");
        return;
    };
    let hello=tokio::time::timeout(Duration::from_secs(8),ws.next()).await;
    let token=match hello {
        Ok(Some(Ok(Message::Text(txt)))) if txt.len()<=512=>{
            let Ok(v)=serde_json::from_str::<Value>(&txt) else{return;};
            if v.get("type").and_then(Value::as_str)!=Some("hello"){return;}
            v.get("token").and_then(Value::as_str).unwrap_or("").to_string()
        },_=>return
    };
    if token!=expected_token{
        let _=app.emit("bridge-connection-detail","모바일 접속 도착: 인증 토큰이 일치하지 않습니다. 새 QR을 스캔하세요.");
        let _=ws.send(Message::Text("{\"type\":\"auth-error\"}".into())).await;return;
    }
    if occupied.swap(true,Ordering::SeqCst){
        let _=app.emit("bridge-connection-detail","이미 다른 모바일 세션이 연결 중입니다.");
        let _=ws.send(Message::Text("{\"type\":\"busy\"}".into())).await;return;
    }
    let (width,height)=monitor_dimensions(&app);
    let mut style_rx=app.state::<PenStyleBus>().0.subscribe();
    let mut action_rx=app.state::<ActionBus>().0.subscribe();
    let mut mode_rx=app.state::<InputModeBus>().0.subscribe();
    let mut tool_rx=app.state::<InkToolBus>().0.subscribe();
    let route_rx=app.state::<DrawingRouteBus>().0.subscribe();
    let mut drawing_stroke_to_app=false;
    let mut active_stroke_app:Option<String>=None;
    let mut ps_rx=app.state::<PhotoshopBus>().0.subscribe();
    let mut mouse_held=false;
    let mut last_mouse_activity=Instant::now();
    let mut mouse_watchdog=tokio::time::interval(Duration::from_millis(500));
    let initial_style=style_rx.borrow().clone();
    let initial_mode=*mode_rx.borrow();
    let initial_tool=*tool_rx.borrow();
    let initial_photoshop=ps_rx.borrow().clone();
    if ws.send(Message::Text(json!({"type":"auth-ok","width":width,"height":height,
        "style":initial_style,"inputMode":initial_mode,"inkTool":initial_tool,
        "photoshop":initial_photoshop}).to_string().into())).await.is_err(){
        occupied.store(false,Ordering::SeqCst);
        let _=app.emit("bridge-connection-detail","인증 응답을 모바일로 전송하지 못했습니다.");
        return;
    }
    let _=app.emit("bridge-connection-detail","모바일 인증 성공: S펜 입력 연결됨");
    let _=app.emit("phone-connected",true);
    loop {
        tokio::select! {
            _=mouse_watchdog.tick()=>{
                if mouse_held&&last_mouse_activity.elapsed()>Duration::from_secs(12){
                    let _=desktop_mouse::left_button(false);mouse_held=false;
                }
            },
            _=shutdown.changed()=>break,
            changed=ps_rx.changed()=>{
                if changed.is_err(){break;}
                let state=ps_rx.borrow().clone();
                let payload=json!({"type":"photoshop-state","state":state}).to_string();
                if ws.send(Message::Text(payload.into())).await.is_err(){break;}
            }
            changed=tool_rx.changed()=>{
                if changed.is_err(){break;}
                let payload=json!({"type":"ink-tool","tool":*tool_rx.borrow()}).to_string();
                if ws.send(Message::Text(payload.into())).await.is_err(){break;}
            }
            changed=mode_rx.changed()=>{
                if changed.is_err(){break;}
                let mode=*mode_rx.borrow();
                let previous_app_stroke=drawing_stroke_to_app;
                drawing_stroke_to_app=false;
                active_stroke_app=None;
                // Switching to Mouse while auto-painting must also release the
                // injected button; otherwise the next mouse move can drag.
                if mouse_held && (mode != InputMode::Mouse || previous_app_stroke){
                    let _=desktop_mouse::left_button(false);mouse_held=false;
                }
                let _=app.emit("pen-packet",json!({"type":"end"}));
                let _=app.emit("pen-packet",json!({"type":"hover-end"}));
                let packet=json!({"type":"input-mode","mode":mode}).to_string();
                if ws.send(Message::Text(packet.into())).await.is_err(){break;}
            }
            changed=style_rx.changed()=>{
                if changed.is_err(){break;}
                let style=style_rx.borrow().clone();
                let payload=json!({"type":"pen-style","style":style}).to_string();
                if ws.send(Message::Text(payload.into())).await.is_err(){break;}
            }
            command=action_rx.recv()=>{
                match command {
                    Ok(action)=>{
                        let payload=json!({"type":"action","action":action}).to_string();
                        if ws.send(Message::Text(payload.into())).await.is_err(){break;}
                    }
                    Err(broadcast::error::RecvError::Lagged(_))=>{},
                    Err(broadcast::error::RecvError::Closed)=>break
                }
            }
            next=ws.next()=>{
                match next {
                    Some(Ok(Message::Text(text))) if text.len()<=6144=>{
                        if let Ok(mut v)=serde_json::from_str::<Value>(&text){
                            let kind=v.get("type").and_then(Value::as_str).unwrap_or("");
                            if kind=="pen-style" {
                                if let Some(raw)=v.get("style"){
                                    if let Ok(style)=serde_json::from_value::<PenStyle>(raw.clone()){
                                        let _=apply_pen_style(&app,style);
                                    }
                                }
                                continue;
                            }
                            // Only authenticated clients can focus/reset the PC floating toolbar.
                            // This never changes the full-screen transparent drawing overlay.
                            if kind=="toolbar-focus" || kind=="toolbar-reset" {
                                // Keep remote toolbar controls limited to our two
                                // known windows, never an arbitrary Tauri window.
                                let side=if v.get("side").and_then(Value::as_str)==Some("right"){
                                    "right"
                                }else{"left"};
                                if kind=="toolbar-focus" {
                                    let _=app.emit("toolbar-control-requested",format!("focus:{side}"));
                                }
                                if kind=="toolbar-reset" {
                                    let _=app.emit("toolbar-control-requested",format!("reset:{side}"));
                                }
                                continue;
                            }
                            if kind=="photoshop"{
                                let action=v.get("action").and_then(Value::as_str).unwrap_or("").to_string();
                                let id=v.get("id").and_then(Value::as_str).map(str::to_owned);
                                let name=v.get("name").and_then(Value::as_str).map(str::to_owned);
                                let enabled=v.get("enabled").and_then(Value::as_bool);
                                let brush=v.get("brush").and_then(|raw|
                                    serde_json::from_value::<BrushType>(raw.clone()).ok());
                                if let Err(error)=photoshop::edit_photoshop(
                                    app.clone(),action,id,name,enabled,brush){
                                    let payload=json!({"type":"photoshop-error","message":error}).to_string();
                                    let _=ws.send(Message::Text(payload.into())).await;
                                }
                                continue;
                            }
                            if kind=="ink-tool"{
                                if let Some(raw)=v.get("tool"){
                                    if let Ok(tool)=serde_json::from_value::<InkTool>(raw.clone()){
                                        apply_ink_tool(&app,tool);
                                    }
                                }
                                continue;
                            }
                            if kind=="input-mode"{
                                if let Some(value)=v.get("mode"){
                                    if let Ok(mode)=serde_json::from_value::<InputMode>(value.clone()){
                                        if mouse_held{let _=desktop_mouse::left_button(false);mouse_held=false;}
                                        apply_input_mode(&app,mode);
                                    }
                                }
                                continue;
                            }
                            if !matches!(kind,"begin"|"move"|"move-batch"|"end"|"hover"|"hover-end"|"clear"|"undo"|"save"|"psd"){continue;}
                            let valid_coordinate=|p:&Value,pressure:bool|{
                                ["x","y"].iter().all(|key|p.get(*key).and_then(Value::as_f64)
                                    .is_some_and(|n|n.is_finite()&&(0.0..=1.0).contains(&n))) &&
                                (!pressure||p.get("pressure").and_then(Value::as_f64)
                                    .is_some_and(|n|n.is_finite()&&(0.0..=1.0).contains(&n)))
                            };
                            if matches!(kind,"begin"|"move")&&!valid_coordinate(&v,true){continue;}
                            if kind=="hover"&&!valid_coordinate(&v,false){continue;}
                            if kind=="move-batch"{
                                let Some(points)=v.get("points").and_then(Value::as_array) else{continue;};
                                if points.is_empty()||points.len()>32||!points.iter().all(|p|valid_coordinate(p,true)){continue;}
                            }
                            if kind=="save"{
                                let _=app.emit("capture-requested",());
                            }else if kind=="psd" {
                                if ps_rx.borrow().enabled{
                                    let _=app.emit("psd-requested",());
                                }
                            }else if matches!(kind,"undo"|"clear"){
                                // These canvas actions are independent of the current
                                // mouse/ink/eraser mode and must always reach overlay.
                                let _=app.emit("pen-packet",v);
                            }else{
                                let mode=*mode_rx.borrow();
                                // Route a full stroke consistently. Only a recognized
                                // FOREGROUND app can receive automatic drawing.
                                let foreground_app=if *route_rx.borrow(){
                                    desktop_mouse::active_drawing_app()
                                }else{None};
                                if drawing_stroke_to_app && foreground_app!=active_stroke_app{
                                    if mouse_held{
                                        let _=desktop_mouse::left_button(false);
                                        mouse_held=false;
                                    }
                                    drawing_stroke_to_app=false;
                                    active_stroke_app=None;
                                    let _=app.emit("drawing-route-changed","overlay");
                                    continue;
                                }
                                if kind=="begin"{
                                    drawing_stroke_to_app=mode==InputMode::Ink&&foreground_app.is_some();
                                    active_stroke_app=if drawing_stroke_to_app{
                                        foreground_app.clone()
                                    }else{None};
                                    if drawing_stroke_to_app{
                                        let _=app.emit("pen-packet",json!({"type":"hover-end"}));
                                    }
                                    let _=app.emit("drawing-route-changed",
                                        if drawing_stroke_to_app{"canvas"}else{"overlay"});
                                }
                                let route_mouse=mode==InputMode::Mouse ||
                                    drawing_stroke_to_app ||
                                    (kind=="hover"&&mode==InputMode::Ink&&foreground_app.is_some());
                                if route_mouse{
                                if mode==InputMode::Ink && kind=="hover"{
                                    let _=app.emit("pen-packet",json!({"type":"hover-end"}));
                                }
                                let position=|point:&Value|{
                                    point.get("x").and_then(Value::as_f64).zip(
                                        point.get("y").and_then(Value::as_f64))
                                };
                                match kind {
                                    "begin"=>{
                                        if let Some((x,y))=position(&v){
                                            if desktop_mouse::move_primary(&app,x,y).is_ok() && !mouse_held {
                                                mouse_held=desktop_mouse::left_button(true).is_ok();
                                                last_mouse_activity=Instant::now();
                                            }
                                        }
                                    }
                                    "move"|"hover"=>{
                                        if let Some((x,y))=position(&v){
                                            let _=desktop_mouse::move_primary(&app,x,y);
                                            if mouse_held{last_mouse_activity=Instant::now();}
                                        }
                                    }
                                    "move-batch"=>{
                                        if let Some(last)=v.get("points").and_then(Value::as_array)
                                            .and_then(|arr|arr.last()){
                                            if let Some((x,y))=position(last){
                                                let _=desktop_mouse::move_primary(&app,x,y);
                                                if mouse_held{last_mouse_activity=Instant::now();}
                                            }
                                        }
                                    }
                                    "end"=>{
                                        if mouse_held{
                                            let _=desktop_mouse::left_button(false);mouse_held=false;
                                        }
                                        drawing_stroke_to_app=false;
                                        active_stroke_app=None;
                                    }
                                    _=>{}
                                }
                            }else{
                                // Snapshot the current tool on stroke begin, so the
                                // overlay never races a separate ink-tool-changed event.
                                if kind=="begin"{
                                    if let Some(object)=v.as_object_mut(){
                                        object.insert("tool".into(),json!(*tool_rx.borrow()));
                                        let state=ps_rx.borrow();
                                        object.insert("layerId".into(),json!(
                                            if state.enabled{state.active_layer_id.as_str()}else{"base"}
                                        ));
                                        object.insert("brush".into(),json!(state.brush));
                                    }
                                }
                                let _=app.emit("pen-packet",v);
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_)))|None|Some(Err(_))=>break,
                    _=>{}
                }
            }
        }
    }
    if mouse_held{let _=desktop_mouse::left_button(false);}
    occupied.store(false,Ordering::SeqCst);
    let _=app.emit("phone-connected",false);
    let _=app.emit("bridge-connection-detail","모바일 연결이 종료되었습니다. 새 QR로 재연결할 수 있습니다.");
}
