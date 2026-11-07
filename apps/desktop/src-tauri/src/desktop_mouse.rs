//! Windows primary-monitor cursor positioning and injected left-button events.
//! Only called after the WebSocket session token has been authenticated.
use tauri::AppHandle;

#[cfg(target_os = "windows")]
mod win32 {
    #[repr(C)]
    #[derive(Clone,Copy)]
    struct MouseInput { dx:i32,dy:i32,mouse_data:u32,flags:u32,time:u32,extra_info:usize }
    #[repr(C)]
    union InputData { mi: MouseInput }
    #[repr(C)]
    struct Input { kind:u32,data:InputData }

    #[link(name = "user32")]
    extern "system" {
        fn SetCursorPos(x:i32,y:i32)->i32;
        fn SendInput(count:u32,inputs:*const Input,cb_size:i32)->u32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access:u32,inherit:i32,pid:u32)->*mut std::ffi::c_void;
        fn QueryFullProcessImageNameW(process:*mut std::ffi::c_void,flags:u32,
            buffer:*mut u16,size:*mut u32)->i32;
        fn CloseHandle(handle:*mut std::ffi::c_void)->i32;
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow()->*mut std::ffi::c_void;
        fn GetWindowThreadProcessId(window:*mut std::ffi::c_void,pid:*mut u32)->u32;
    }
    /// Only the current foreground application's executable is considered.
    /// Never redirect the stylus just because a paint process is running.
    pub fn foreground_process()->Option<String>{
        unsafe{
            let window=GetForegroundWindow();
            if window.is_null(){return None;}
            let mut pid=0u32;
            GetWindowThreadProcessId(window,&mut pid);
            if pid==0{return None;}
            let process=OpenProcess(0x1000,0,pid); // PROCESS_QUERY_LIMITED_INFORMATION
            if process.is_null(){return None;}
            let mut buf=[0u16;1024];let mut len=buf.len() as u32;
            let ok=QueryFullProcessImageNameW(process,0,buf.as_mut_ptr(),&mut len);
            CloseHandle(process);
            if ok==0{return None;}
            Some(String::from_utf16_lossy(&buf[..len as usize]))
        }
    }
    pub fn move_cursor(x:i32,y:i32)->Result<(),String>{
        if unsafe{SetCursorPos(x,y)}==0 {Err("SetCursorPos failed".into())} else {Ok(())}
    }
    pub fn left_button(down:bool)->Result<(),String>{
        let input=Input{
            kind:0,
            data:InputData{mi:MouseInput{
                dx:0,dy:0,mouse_data:0,flags:if down{0x0002}else{0x0004},
                time:0,extra_info:0
            }}
        };
        if unsafe{SendInput(1,&input,std::mem::size_of::<Input>() as i32)}==1{
            Ok(())
        }else{Err("SendInput was blocked by Windows".into())}
    }
}

pub fn move_primary(app:&AppHandle,x:f64,y:f64)->Result<(),String>{
    if !x.is_finite() || !y.is_finite() || !(0.0..=1.0).contains(&x) ||
       !(0.0..=1.0).contains(&y) {return Err("Invalid cursor coordinates".into());}
    let monitor=app.primary_monitor().map_err(|e|e.to_string())?
        .ok_or("No primary monitor")?;
    let pos=monitor.position();
    let size=monitor.size();
    let screen_x=pos.x+((size.width.saturating_sub(1)) as f64*x).round() as i32;
    let screen_y=pos.y+((size.height.saturating_sub(1)) as f64*y).round() as i32;
    #[cfg(target_os = "windows")]
    {win32::move_cursor(screen_x,screen_y)}
    #[cfg(not(target_os = "windows"))]
    {let _=(screen_x,screen_y);Err("Desktop mouse control requires Windows".into())}
}

pub fn left_button(down:bool)->Result<(),String>{
    #[cfg(target_os = "windows")]
    {win32::left_button(down)}
    #[cfg(not(target_os = "windows"))]
    {let _=down;Err("Desktop mouse control requires Windows".into())}
}

pub fn supported_drawing_exe(exe:&str)->bool{
    matches!(exe.to_ascii_lowercase().as_str(),
        "photoshop.exe"|"mspaint.exe"|"krita.exe"|"paintdotnet.exe"|
        "clipstudiopaint.exe"|"sai.exe"|"sai2.exe")
}
pub fn active_drawing_app()->Option<String>{
    #[cfg(target_os="windows")]
    {
        let path=win32::foreground_process()?;
        let exe=path.rsplit(['\\','/']).next()?.to_ascii_lowercase();
        if supported_drawing_exe(&exe){Some(exe)}else{None}
    }
    #[cfg(not(target_os="windows"))]
    {None}
}
#[cfg(test)]
mod route_tests{
    use super::supported_drawing_exe;
    #[test]
    fn only_supported_foreground_executables_are_auto_targeted(){
        for exe in ["Photoshop.exe","mspaint.exe","KRITA.EXE","paintdotnet.exe",
            "CLIPSTUDIOPAINT.EXE"]{assert!(supported_drawing_exe(exe));}
        for exe in ["chrome.exe","explorer.exe","notepad.exe","cmd.exe","fakephotoshop.exe"]{
            assert!(!supported_drawing_exe(exe));
        }
    }
}
