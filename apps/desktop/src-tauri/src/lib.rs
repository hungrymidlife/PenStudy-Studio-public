mod bridge;
mod desktop_mouse;
mod hotkeys;
mod photoshop;



fn toolbar_for_side(side:&str)->Result<&'static str,String>{
    match side{
        "left"=>Ok("toolbar"),
        "right"=>Ok("toolbar-right"),
        _=>Err("툴바 방향은 left/right 중 하나여야 합니다.".into()),
    }
}
fn position_toolbar(app:&AppHandle,side:&str)->Result<(),String>{
    let label=toolbar_for_side(side)?;
    let toolbar=app.get_webview_window(label).ok_or("필기 툴바를 찾지 못했습니다.")?;
    let monitor=app.primary_monitor().map_err(|e|e.to_string())?
        .ok_or("주 모니터를 찾을 수 없습니다.")?;
    let origin=monitor.position();
    let screen=monitor.size();
    let bar=toolbar.outer_size().map_err(|e|e.to_string())?;
    let x=if side=="left"{
        origin.x+20
    }else{
        origin.x+(screen.width as i32-bar.width as i32-20).max(0)
    };
    toolbar.set_position(Position::Physical(PhysicalPosition{x,y:origin.y+30}))
        .map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
fn reset_toolbar_position(app:AppHandle,side:Option<String>)->Result<(),String>{
    match side.as_deref(){
        Some("left")=>position_toolbar(&app,"left"),
        Some("right")=>position_toolbar(&app,"right"),
        None|Some("all")=>{
            position_toolbar(&app,"left")?;
            position_toolbar(&app,"right")
        },
        _=>Err("알 수 없는 툴바 위치입니다.".into())
    }
}
#[tauri::command]
fn focus_toolbar(app:AppHandle,side:Option<String>)->Result<(),String>{
    let label=toolbar_for_side(side.as_deref().unwrap_or("left"))?;
    let toolbar=app.get_webview_window(label).ok_or("필기 툴바를 찾지 못했습니다.")?;
    toolbar.show().map_err(|e|e.to_string())?;
    toolbar.set_focus().map_err(|e|e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_active_drawing_app()->Option<String>{
    desktop_mouse::active_drawing_app()
}
#[tauri::command]
fn suggest_lan_ip() -> Result<String,String> {
    // UDP connect selects the active network interface; it sends no packet.
    let socket=std::net::UdpSocket::bind("0.0.0.0:0").map_err(|e|e.to_string())?;
    socket.connect("1.1.1.1:80").map_err(|e|e.to_string())?;
    let addr=socket.local_addr().map_err(|e|e.to_string())?;
    Ok(addr.ip().to_string())
}

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{imageops::{overlay,resize,FilterType},load_from_memory};
use serde_json::json;
use std::{fs,path::PathBuf,time::Duration};
use tauri::{AppHandle, Emitter, Listener, Manager, PhysicalPosition, PhysicalSize, Position, Size};

use bridge::{ActionBus, BridgeState, PenStyleBus, InputModeBus, InkToolBus, DrawingRouteBus};
use photoshop::PhotoshopBus;
use hotkeys::{HotkeyBus,HotkeyCaptureBus};

/// Normalized rectangle within the primary monitor, independent of screen DPI.
#[derive(Clone,Copy,Debug,serde::Serialize,serde::Deserialize)]
struct CaptureRegion { x:f64, y:f64, width:f64, height:f64 }
impl CaptureRegion{
    fn validate(&self)->Result<(),String>{
        let all=[self.x,self.y,self.width,self.height];
        if all.iter().any(|v|!v.is_finite())||
            self.x<0.0||self.y<0.0||self.width<=0.0||self.height<=0.0||
            self.x+self.width>1.000001||self.y+self.height>1.000001{
            return Err("캡처 영역 좌표가 올바르지 않습니다.".into());
        }
        Ok(())
    }
}
#[cfg(test)]
mod capture_region_tests {
    use super::CaptureRegion;

    #[test]
    fn valid_regions_are_normalized_and_reverse_drag_is_pre_normalized() {
        assert!(CaptureRegion{x:0.2,y:0.1,width:0.5,height:0.6}.validate().is_ok());
        assert!(CaptureRegion{x:0.0,y:0.0,width:1.0,height:1.0}.validate().is_ok());
        assert!(CaptureRegion{x:0.9,y:0.1,width:0.2,height:0.5}.validate().is_err());
        assert!(CaptureRegion{x:0.1,y:0.1,width:0.0,height:0.5}.validate().is_err());
        assert!(CaptureRegion{x:f64::NAN,y:0.0,width:0.4,height:0.4}.validate().is_err());
        assert!(CaptureRegion{x:0.1,y:-0.1,width:0.4,height:0.4}.validate().is_err());
    }
}
fn capture_region_path(app:&AppHandle)->Result<PathBuf,String>{
    Ok(app.path().app_config_dir().map_err(|e|e.to_string())?
        .join("capture-region.json"))
}
#[tauri::command]
fn get_fixed_capture_region(app:AppHandle)->Result<Option<CaptureRegion>,String>{
    let path=capture_region_path(&app)?;
    if !path.exists(){return Ok(None);}
    let region:CaptureRegion=serde_json::from_slice(
        &fs::read(path).map_err(|e|e.to_string())?)
        .map_err(|e|format!("고정 캡처 영역 설정을 읽을 수 없습니다: {e}"))?;
    region.validate()?;
    Ok(Some(region))
}
#[tauri::command]
fn set_fixed_capture_region(app:AppHandle,region:CaptureRegion)->Result<(),String>{
    region.validate()?;
    let path=capture_region_path(&app)?;
    if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|e.to_string())?;}
    let bytes=serde_json::to_vec(&region).map_err(|e|e.to_string())?;
    fs::write(path,bytes).map_err(|e|e.to_string())?;
    app.emit("fixed-capture-region-updated",region).map_err(|e|e.to_string())
}
#[tauri::command]
fn clear_fixed_capture_region(app:AppHandle)->Result<(),String>{
    let path=capture_region_path(&app)?;
    if path.exists(){fs::remove_file(path).map_err(|e|e.to_string())?;}
    app.emit("fixed-capture-region-updated",serde_json::Value::Null)
        .map_err(|e|e.to_string())
}
/// Temporarily make the fullscreen ink window interactive for rectangle dragging.
/// In normal drawing mode it stays click-through.
#[tauri::command]
fn set_capture_selection_active(app:AppHandle,active:bool)->Result<(),String>{
    let window=app.get_webview_window("overlay").ok_or("필기 창이 없습니다.")?;
    window.set_ignore_cursor_events(!active).map_err(|e|e.to_string())?;
    // Toolbars should never cover a rectangle edge during selection.
    for label in ["toolbar","toolbar-right"]{
        if let Some(toolbar)=app.get_webview_window(label){
            if active{
                let _=toolbar.hide();
            }else{
                let _=toolbar.show();
            }
        }
    }
    if active{let _=window.set_focus();}
    Ok(())
}

#[tauri::command]
fn request_action(app:AppHandle, action:String)->Result<(),String>{
    if !matches!(action.as_str(),"save"|"region"|"fixed"|"configure-region"|"psd"|"undo"|"clear") {return Err("지원하지 않는 동작".into());}
    let event=match action.as_str(){
        "save"=>"capture-requested","region"=>"capture-region-requested",
        "fixed"=>"capture-fixed-requested",
        "configure-region"=>"capture-configure-region-requested",
        "psd"=>"psd-requested",
        "undo"=>"undo-requested",_=>"clear-requested"
    };
    app.emit(event,()).map_err(|e|e.to_string())
}

#[tauri::command]
async fn save_capture(app:AppHandle, canvas_data_url:String,
    output_folder:Option<String>,region:Option<CaptureRegion>) -> Result<String,String> {
    if let Some(area)=region{area.validate()?;}
    const PREFIX:&str="data:image/png;base64,";
    let raw=canvas_data_url.strip_prefix(PREFIX).ok_or("PNG 데이터 형식이 아닙니다.")?;
    if raw.len()>64*1024*1024 {return Err("필기 이미지가 너무 큽니다.".into());}
    let bytes=STANDARD.decode(raw).map_err(|e|e.to_string())?;
    let annotation=load_from_memory(&bytes).map_err(|e|e.to_string())?.to_rgba8();
    let overlay_window=app.get_webview_window("overlay").ok_or("오버레이 창을 찾을 수 없습니다.")?;
    // Window placement is physical pixels. Preserve the moved overlay's
    // exact position/size when compositing the saved PNG.
    let layer_position=overlay_window.outer_position().map_err(|e|e.to_string())?;
    let layer_size=overlay_window.inner_size().map_err(|e|e.to_string())?;
    // Own the position data before moving it into spawn_blocking ('static).
    // Monitor::position() borrows the monitor, which must not be temporary.
    let primary_position={
        let monitor=app.primary_monitor().map_err(|e|e.to_string())?
            .ok_or("주 모니터를 찾을 수 없습니다.")?;
        let position=monitor.position();
        PhysicalPosition{x:position.x,y:position.y}
    };
    // The click-through ink overlay and interactive floating toolbar are separate windows.
    // Hide both so neither becomes part of the captured document.
    for label in ["toolbar","toolbar-right"]{
        if let Some(toolbar)=app.get_webview_window(label){
            toolbar.hide().map_err(|e|e.to_string())?;
        }
    }
    if let Err(error)=overlay_window.hide() {
        for label in ["toolbar","toolbar-right"]{
            if let Some(toolbar)=app.get_webview_window(label){let _=toolbar.show();}
        }
        return Err(error.to_string());
    }
    let work=tokio::task::spawn_blocking(move || -> Result<String,String>{
        // Wait for the compositor to present the unobstructed desktop.
        std::thread::sleep(Duration::from_millis(200));
        let monitors=xcap::Monitor::all().map_err(|e|e.to_string())?;
        let monitor=monitors.iter().find(|m|m.is_primary().unwrap_or(false))
            .or_else(||monitors.first()).ok_or("디스플레이가 없습니다.")?;
        let mut picture=monitor.capture_image().map_err(|e|e.to_string())?;
        let painted=if annotation.dimensions()!=(layer_size.width,layer_size.height){
            resize(&annotation,layer_size.width,layer_size.height,FilterType::Triangle)
        }else{annotation};
        let left=i64::from(layer_position.x)-i64::from(primary_position.x);
        let top=i64::from(layer_position.y)-i64::from(primary_position.y);
        overlay(&mut picture,&painted,left,top);
        // Crop the already composited desktop+ink, not the ink layer alone.
        // Values are normalized so saved presets survive DPI/resolution changes.
        let picture=if let Some(rect)=region{
            let (pw,ph)=picture.dimensions();
            let x=((rect.x*pw as f64).floor() as u32).min(pw.saturating_sub(1));
            let y=((rect.y*ph as f64).floor() as u32).min(ph.saturating_sub(1));
            let w=((rect.width*pw as f64).round() as u32).max(1).min(pw-x);
            let h=((rect.height*ph as f64).round() as u32).max(1).min(ph-y);
            image::imageops::crop_imm(&picture,x,y,w,h).to_image()
        }else{picture};
        let folder=output_folder.filter(|s|!s.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(||dirs::picture_dir().unwrap_or_else(std::env::temp_dir).join("PenStudyCaptures"));
        fs::create_dir_all(&folder).map_err(|e|format!("저장 폴더를 만들 수 없습니다: {e}"))?;
        let file=folder.join(format!("PenStudy_{}.png",chrono::Local::now().format("%Y%m%d_%H%M%S_%3f")));
        picture.save(&file).map_err(|e|e.to_string())?;
        Ok(file.display().to_string())
    }).await.map_err(|e|e.to_string());
    let show_result=overlay_window.show().map_err(|e|e.to_string());
    for label in ["toolbar","toolbar-right"]{
        if let Some(toolbar)=app.get_webview_window(label){let _=toolbar.show();}
    }
    if let Err(e)=show_result{return Err(format!("오버레이를 다시 표시하지 못했습니다: {e}"));}
    let result=work??;
    let _=app.emit("capture-saved",json!({"path":result.clone()}));
    Ok(result)
}

#[tauri::command]
async fn capture_desktop_base64(app:AppHandle)->Result<String,String>{
    let overlay_window=app.get_webview_window("overlay").ok_or("필기 창이 없습니다.")?;
    for label in ["toolbar","toolbar-right"]{
        if let Some(tb)=app.get_webview_window(label){
            tb.hide().map_err(|e|e.to_string())?;
        }
    }
    if let Err(e)=overlay_window.hide(){
        for label in ["toolbar","toolbar-right"]{
            if let Some(tb)=app.get_webview_window(label){let _=tb.show();}
        }
        return Err(e.to_string());
    }
    let work=tokio::task::spawn_blocking(move || -> Result<String,String>{
        std::thread::sleep(Duration::from_millis(200));
        let monitors=xcap::Monitor::all().map_err(|e|e.to_string())?;
        let monitor=monitors.iter().find(|m|m.is_primary().unwrap_or(false))
            .or_else(||monitors.first()).ok_or("화면 캡처할 디스플레이가 없습니다.")?;
        let image=monitor.capture_image().map_err(|e|e.to_string())?;
        let mut out=std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut out,image::ImageFormat::Png)
            .map_err(|e|e.to_string())?;
        Ok(format!("data:image/png;base64,{}",STANDARD.encode(out.into_inner())))
    }).await.map_err(|e|e.to_string());
    let visible=overlay_window.show().map_err(|e|e.to_string());
    for label in ["toolbar","toolbar-right"]{
        if let Some(tb)=app.get_webview_window(label){let _=tb.show();}
    }
    visible?;
    work?
}

#[tauri::command]
async fn save_psd(app:AppHandle,psd_base64:String,
    output_folder:Option<String>)->Result<String,String>{
    if psd_base64.len()>256*1024*1024{
        return Err("PSD 파일 데이터가 너무 큽니다(256MB 초과). 레이어 수를 줄이세요.".into());
    }
    let bytes=STANDARD.decode(psd_base64).map_err(|e|e.to_string())?;
    if bytes.len()<26 || &bytes[..4]!=b"8BPS" || bytes[4]!=0 || bytes[5]!=1{
        return Err("PSD 파일 헤더가 올바르지 않습니다.".into());
    }
    let path=tokio::task::spawn_blocking(move ||->Result<String,String>{
        let folder=output_folder.filter(|s|!s.trim().is_empty())
            .map(PathBuf::from).unwrap_or_else(||
                dirs::picture_dir().unwrap_or_else(std::env::temp_dir).join("PenStudyCaptures"));
        fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
        let path=folder.join(format!("PenStudy_{}.psd",
            chrono::Local::now().format("%Y%m%d_%H%M%S_%3f")));
        fs::write(&path,&bytes).map_err(|e|e.to_string())?;
        Ok(path.display().to_string())
    }).await.map_err(|e|e.to_string())??;
    let _=app.emit("capture-saved",json!({"path":path.clone()}));
    Ok(path)
}


pub fn run(){
    tauri::Builder::default()
        .manage(BridgeState::default())
        .manage(PenStyleBus::default())
        .manage(ActionBus::default())
        .manage(InputModeBus::default())
        .manage(InkToolBus::default())
        .manage(DrawingRouteBus::default())
        .manage(PhotoshopBus::default())
        .manage(HotkeyBus::default())
        .manage(HotkeyCaptureBus::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app|{
            // React main-window settings are the initial source of truth for the relay.
            let ink_handle=app.handle().clone();
            app.listen("settings-updated",move |event|{
                if let Ok(style)=serde_json::from_str::<bridge::PenStyle>(event.payload()){
                    let _=bridge::apply_pen_style(&ink_handle,style);
                }
            });
            let clear_bus=app.state::<ActionBus>().0.clone();
            app.listen("clear-requested",move |_|{let _=clear_bus.send("clear");});
            let undo_bus=app.state::<ActionBus>().0.clone();
            app.listen("undo-requested",move |_|{let _=undo_bus.send("undo");});
            // The phone controls ONLY reposition/focus the small floating toolbar.
            // The drawing overlay is permanently fullscreen and click-through.
            let toolbar_handle=app.handle().clone();
            app.listen("toolbar-control-requested",move |event|{
                let command=event.payload().trim_matches('"');
                let (action,side)=command.split_once(':').unwrap_or((command,"left"));
                match action{
                    "focus"=>{let _=focus_toolbar(toolbar_handle.clone(),Some(side.into()));},
                    "reset"=>{let _=reset_toolbar_position(toolbar_handle.clone(),Some(side.into()));},
                    _=>{}
                }
            });
            if let (Some(monitor),Some(window))=(app.primary_monitor()?,app.get_webview_window("overlay")) {
                let pos=monitor.position();let size=monitor.size();
                window.set_position(Position::Physical(PhysicalPosition{x:pos.x,y:pos.y}))?;
                window.set_size(Size::Physical(PhysicalSize{width:size.width,height:size.height}))?;
                window.set_ignore_cursor_events(true)?;
                window.show()?;
            }
            // Show toolbar last so it remains above the transparent drawing layer.
            for side in ["left","right"]{
                let label=if side=="left"{"toolbar"}else{"toolbar-right"};
                if let Some(toolbar)=app.get_webview_window(label){
                    toolbar.show()?;
                    if let Err(error)=position_toolbar(app.handle(),side){
                        eprintln!("[PenStudy] Could not place {side} toolbar: {error}");
                    }
                }
            }
            app.handle().plugin(tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app,shortcut,event|{
                    hotkeys::handle_pressed(app,shortcut,event.state);
                }).build())?;
            hotkeys::initialize(app.handle());
            Ok(())
        })
        .on_window_event(|window,event|{
            // Tauri keeps running while the overlay and toolbar webviews exist.
            // Treat the main window close button as a full application shutdown.
            if window.label()=="main" && matches!(event,tauri::WindowEvent::CloseRequested{..}){
                eprintln!("[PenStudy] Main window closing: stopping WebSocket listener on 39871 and exiting.");
                let app=window.app_handle();
                bridge::stop_bridge_on_exit(app);
                app.exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            bridge::start_bridge,bridge::stop_bridge,bridge::bridge_status,
            request_action,save_capture,save_psd,capture_desktop_base64,
            suggest_lan_ip,bridge::get_pen_style,bridge::set_pen_style,
            bridge::get_input_mode,bridge::set_input_mode,
            bridge::get_auto_canvas_routing,bridge::set_auto_canvas_routing,
            get_active_drawing_app,
            bridge::get_ink_tool,bridge::set_ink_tool,
            photoshop::get_photoshop,photoshop::edit_photoshop,
            hotkeys::get_hotkeys,hotkeys::set_hotkeys,
            hotkeys::set_hotkey_capture_mode,
            reset_toolbar_position,focus_toolbar,
            get_fixed_capture_region,set_fixed_capture_region,clear_fixed_capture_region,
            set_capture_selection_active
        ])
        .run(tauri::generate_context!())
        .expect("PenStudy Studio failed to start");
}
