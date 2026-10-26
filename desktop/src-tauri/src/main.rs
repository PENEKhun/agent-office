#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, State, WebviewWindow, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;
mod cursor_passthrough;
use cursor_passthrough::CursorPassthroughController;

struct ServerProcess(Mutex<Option<Child>>);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ServerAction {
    Attach,
    Start,
}

fn server_action(is_responding: bool) -> ServerAction {
    if is_responding {
        ServerAction::Attach
    } else {
        ServerAction::Start
    }
}

fn server_responds(port: u16) -> bool {
    let Ok(addresses) = format!("127.0.0.1:{port}").to_socket_addrs() else {
        return false;
    };
    for address in addresses {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(350)) {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
            let request = format!(
                "GET /api/state HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(request.as_bytes()).is_err() {
                continue;
            }
            let mut response = [0_u8; 128];
            if let Ok(length) = stream.read(&mut response) {
                if response[..length].starts_with(b"HTTP/1.1 200")
                    || response[..length].starts_with(b"HTTP/1.0 200")
                {
                    return true;
                }
            }
        }
    }
    false
}

fn project_server_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf()
}

fn configured_server_dir(app: &AppHandle<Wry>) -> PathBuf {
    let config_path = app
        .path()
        .app_config_dir()
        .map(|path| path.join("config.json"))
        .unwrap_or_default();
    let configured = std::fs::read_to_string(config_path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|json| {
            json.get("serverDir")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .filter(|path| !path.trim().is_empty());
    if let Some(path) = configured {
        return PathBuf::from(path);
    }
    if let Ok(resources) = app.path().resource_dir() {
        let packaged = resources.join("server");
        if packaged.join("server.js").is_file() {
            return packaged;
        }
    }
    project_server_dir()
}

fn node_executable(resource_dir: &Path) -> PathBuf {
    let bundled = resource_dir.join("node.exe");
    node_path(&bundled, bundled.is_file())
}

fn node_path(bundled: &Path, exists: bool) -> PathBuf {
    if exists {
        bundled.to_path_buf()
    } else {
        PathBuf::from("node")
    }
}

fn choose_port() -> Result<u16, String> {
    let ports: Vec<u16> = (4777..=4787).collect();
    let responding: Vec<bool> = ports.iter().map(|port| server_responds(*port)).collect();
    let available: Vec<bool> = ports
        .iter()
        .map(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
        .collect();
    select_port(&available, &responding).ok_or_else(|| {
        "Agent Office could not find an available port between 4777 and 4787.".into()
    })
}

fn select_port(available: &[bool], responding: &[bool]) -> Option<u16> {
    responding
        .iter()
        .position(|is_responding| *is_responding)
        .or_else(|| available.iter().position(|is_available| *is_available))
        .and_then(|index| u16::try_from(index).ok())
        .map(|offset| 4777 + offset)
}

fn spawn_server(
    server_dir: &Path,
    node: &Path,
    port: u16,
    config_dir: &Path,
) -> std::io::Result<Child> {
    let mut command = Command::new(node);
    command
        .arg("server.js")
        .current_dir(server_dir)
        .env("AGENT_OFFICE_PORT", port.to_string())
        .env("AGENT_OFFICE_CONFIG", config_dir.join("config.json"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command.spawn()
}

fn ensure_server(app: &AppHandle<Wry>) -> Result<(Option<Child>, u16), String> {
    let port = choose_port()?;
    match server_action(server_responds(port)) {
        ServerAction::Attach => Ok((None, port)),
        ServerAction::Start => {
            let config_dir = app
                .path()
                .app_config_dir()
                .map_err(|error| error.to_string())?;
            std::fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
            let server_dir = configured_server_dir(app);
            let resources = app.path().resource_dir().unwrap_or_default();
            let node = node_executable(&resources);
            let mut child = spawn_server(&server_dir, &node, port, &config_dir)
                .map_err(|error| format!("Could not start Agent Office server: {error}"))?;
            let deadline = Instant::now() + Duration::from_secs(8);
            while Instant::now() < deadline {
                if child
                    .try_wait()
                    .map_err(|error| error.to_string())?
                    .is_some()
                {
                    return Err("Agent Office server stopped before becoming ready.".into());
                }
                if server_responds(port) {
                    return Ok((Some(child), port));
                }
                thread::sleep(Duration::from_millis(100));
            }
            let _ = child.kill();
            Err(format!(
                "Agent Office server did not become ready at 127.0.0.1:{port}."
            ))
        }
    }
}

fn show_window(window: &WebviewWindow<Wry>) {
    let _ = window.show();
    let _ = window.set_focus();
}

fn widget_settings_path(app: &AppHandle<Wry>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("widget-settings.json"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_widget_settings(app: AppHandle<Wry>) -> serde_json::Value {
    widget_settings_path(&app)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .unwrap_or_else(|| serde_json::json!({"background": 100, "overall": 100, "autoDim": false}))
}

fn normalize_widget_settings(settings: serde_json::Value) -> serde_json::Value {
    let background = settings
        .get("background")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(100)
        .min(100);
    let overall = settings
        .get("overall")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(100)
        .clamp(30, 100);
    let auto_dim = settings
        .get("autoDim")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    serde_json::json!({"background": background, "overall": overall, "autoDim": auto_dim})
}

#[tauri::command]
fn save_widget_settings(app: AppHandle<Wry>, settings: serde_json::Value) -> Result<(), String> {
    let path = widget_settings_path(&app)?;
    let value = normalize_widget_settings(settings);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(path, value.to_string()).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_mouse_passthrough(
    app: AppHandle<Wry>,
    controller: State<'_, CursorPassthroughController>,
    enabled: bool,
) {
    controller.set(&app, enabled);
}

#[tauri::command]
fn mouse_passthrough_enabled(controller: State<'_, CursorPassthroughController>) -> bool {
    controller.is_enabled()
}

fn is_passthrough_hotkey(shortcut: &Shortcut, state: ShortcutState) -> bool {
    *shortcut == Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyO)
        && state == ShortcutState::Pressed
}

fn tray(
    app: &AppHandle<Wry>,
    port: u16,
    cursor_state: CursorPassthroughController,
) -> tauri::Result<()> {
    let version: String = serde_json::from_str(include_str!("../tauri.conf.json"))
        .ok()
        .and_then(|config: Value| config.get("version")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| "unknown".into());
    let show = MenuItem::with_id(app, "show", "보이기 / 숨기기", true, None::<&str>)?;
    let office = MenuItem::with_id(app, "office", "오피스", true, None::<&str>)?;
    let mini = MenuItem::with_id(app, "mini", "미니", true, None::<&str>)?;
    let always_on_top =
        CheckMenuItem::with_id(app, "always-on-top", "항상 위", true, true, None::<&str>)?;
    let passthrough = CheckMenuItem::with_id(
        app,
        "mouse-passthrough",
        "마우스 통과 (켜기·끄기: Ctrl+Alt+O)",
        true,
        false,
        None::<&str>,
    )?;
    let startup_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let startup = CheckMenuItem::with_id(
        app,
        "startup",
        "Windows 시작 시 실행",
        true,
        startup_enabled,
        None::<&str>,
    )?;
    let diagnostics = MenuItem::with_id(app, "diagnostics", "진단 내보내기", true, None::<&str>)?;
    let version_item = MenuItem::with_id(
        app,
        "version",
        format!("Agent Office {version}"),
        false,
        None::<&str>,
    )?;
    let connection = MenuItem::with_id(app, "connection", "연결 상태", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &version_item,
            &connection,
            &show,
            &office,
            &mini,
            &always_on_top,
            &passthrough,
            &startup,
            &diagnostics,
            &quit,
        ],
    )?;
    let top_item = always_on_top.clone();
    let startup_item = startup.clone();
    cursor_state.set_tray_item(passthrough.clone());
    let passthrough_state = cursor_state.clone();
    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Agent Office · Ctrl+Alt+O로 마우스 통과 켜기·끄기")
        .on_menu_event(move |app, event| {
            let Some(window) = app.get_webview_window("main") else {
                return;
            };
            match event.id().as_ref() {
                "show" => {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        show_window(&window);
                    }
                }
                "office" => {
                    let _ = window.eval("document.getElementById('widget-office-button')?.click()");
                    show_window(&window);
                }
                "mini" => {
                    let _ = window.eval("document.getElementById('widget-mini-button')?.click()");
                    show_window(&window);
                }
                "connection" => {
                    show_window(&window);
                    let _ = window.eval("window.__agentOfficeConnectionRequested=true; window.__agentOfficeShowConnection?.()");
                }
                "always-on-top" => {
                    let enabled = !window.is_always_on_top().unwrap_or(true);
                    let _ = window.set_always_on_top(enabled);
                    let _ = top_item.set_checked(enabled);
                }
                "mouse-passthrough" => {
                    let enabled = !passthrough_state.is_enabled();
                    passthrough_state.set(app, enabled);
                }
                "startup" => {
                    let enabled = !app.autolaunch().is_enabled().unwrap_or(false);
                    let result = if enabled {
                        app.autolaunch().enable()
                    } else {
                        app.autolaunch().disable()
                    };
                    if result.is_ok() {
                        let _ = startup_item.set_checked(enabled);
                    }
                }
                "diagnostics" => export_diagnostics(app, port),
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    show_window(&window);
                }
            }
        })
        .icon(
            app.default_window_icon()
                .expect("bundle icon required")
                .clone(),
        )
        .build(app)?;
    Ok(())
}

fn fetch_diagnostics(port: u16) -> Result<Value, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|error| error.to_string())?;
    let request = format!(
        "GET /api/diagnostics HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or("Invalid diagnostics response")?;
    let decoded = if headers
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked")
    {
        decode_chunked(body)?
    } else {
        body.to_owned()
    };
    serde_json::from_str(&decoded).map_err(|error| error.to_string())
}

fn decode_chunked(mut body: &str) -> Result<String, String> {
    let mut decoded = Vec::new();
    loop {
        let (size, remaining) = body.split_once("\r\n").ok_or("Invalid diagnostics chunk")?;
        let size = usize::from_str_radix(size.trim(), 16).map_err(|error| error.to_string())?;
        body = remaining;
        if size == 0 {
            break;
        }
        if body.len() < size + 2 {
            return Err("Incomplete diagnostics chunk".into());
        }
        decoded.extend_from_slice(&body.as_bytes()[..size]);
        body = &body[size + 2..];
    }
    String::from_utf8(decoded).map_err(|error| error.to_string())
}

fn export_diagnostics(app: &AppHandle<Wry>, port: u16) {
    let Ok(mut report) = fetch_diagnostics(port) else {
        let _ = app
            .notification()
            .builder()
            .title("Agent Office 진단 파일 저장 실패")
            .body("진단 정보를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.")
            .show();
        return;
    };
    let version: String = serde_json::from_str(include_str!("../tauri.conf.json"))
        .ok()
        .and_then(|config: Value| config.get("version")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| "unknown".into());
    let windows_version = Command::new("cmd.exe")
        .args(["/C", "ver"])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .unwrap_or_default();
    if let Some(object) = report.as_object_mut() {
        object.insert("appVersion".into(), Value::String(version));
        object.insert("windowsVersion".into(), Value::String(windows_version));
        object.insert("port".into(), Value::from(port));
    }
    let desktop = app.path().desktop_dir().ok();
    let date = Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", "Get-Date -Format yyyy-MM-dd"])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .unwrap_or_else(|| "unknown-date".into());
    let result = desktop.map(|directory| {
        let path = directory.join(format!("agent-office-diagnostics-{date}.json"));
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(&report).unwrap_or_default(),
        )
        .map(|_| path)
    });
    if let Some(Ok(path)) = result {
        let _ = app
            .notification()
            .builder()
            .title("Agent Office 진단 파일 저장 완료")
            .body(format!("바탕화면에 저장했습니다: {}", path.display()))
            .show();
    } else {
        let _ = app
            .notification()
            .builder()
            .title("Agent Office 진단 파일 저장 실패")
            .body("바탕화면에 파일을 저장하지 못했습니다.")
            .show();
    }
}

fn main() {
    let cursor_state = CursorPassthroughController::default();
    let hotkey_state = cursor_state.clone();
    let setup_cursor_state = cursor_state.clone();
    let exit_cursor_state = cursor_state.clone();
    let polling_stopped = Arc::new(AtomicBool::new(false));
    let setup_polling_stopped = polling_stopped.clone();
    let app = tauri::Builder::default()
        .manage(cursor_state)
        .invoke_handler(tauri::generate_handler![
            load_widget_settings,
            save_widget_settings,
            set_mouse_passthrough,
            mouse_passthrough_enabled
        ])
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if is_passthrough_hotkey(shortcut, event.state()) {
                        hotkey_state.set(app, !hotkey_state.is_enabled());
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                show_window(&window);
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(move |app| {
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyO);
            app.global_shortcut().register(shortcut)?;
            let (child, port) = ensure_server(app.handle()).map_err(std::io::Error::other)?;
            if let Some(window) = app.get_webview_window("main") {
                let url = tauri::Url::parse(&format!("http://127.0.0.1:{port}/widget"))
                    .map_err(std::io::Error::other)?;
                window.navigate(url).map_err(std::io::Error::other)?;
                let _ = window.show();
            }
            app.manage(ServerProcess(Mutex::new(child)));
            tray(app.handle(), port, setup_cursor_state.clone())?;
            setup_cursor_state.set(app.handle(), false);
            setup_cursor_state.start_polling(app.handle().clone(), setup_polling_stopped.clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Agent Office desktop app");
    app.run(move |handle, event| match event {
        RunEvent::Exit => {
            polling_stopped.store(true, Ordering::Relaxed);
            exit_cursor_state.set(handle, false);
            if let Some(server) = handle.try_state::<ServerProcess>() {
                if let Ok(mut child) = server.0.lock() {
                    if let Some(child) = child.as_mut() {
                        let _ = child.kill();
                    }
                }
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::{
        is_passthrough_hotkey, node_path, normalize_widget_settings, select_port,
        server_action, ServerAction,
    };
    use std::path::Path;
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

    #[test]
    fn attaches_when_server_is_already_responding() {
        assert_eq!(server_action(true), ServerAction::Attach);
    }

    #[test]
    fn starts_server_when_probe_fails() {
        assert_eq!(server_action(false), ServerAction::Start);
    }

    #[test]
    fn bundled_node_is_preferred_when_present() {
        let bundled = Path::new("resources/node.exe");
        assert_eq!(node_path(bundled, true), bundled);
    }

    #[test]
    fn missing_bundled_node_falls_back_to_system_node() {
        let bundled = Path::new("resources/node.exe");
        assert_eq!(node_path(bundled, false), Path::new("node"));
    }

    #[test]
    fn selects_first_available_port_and_attaches_to_existing_server() {
        assert_eq!(select_port(&[false, false], &[false, false]), None);
        assert_eq!(select_port(&[false, true], &[false, false]), Some(4778));
        assert_eq!(
            select_port(&[true, false, false, false], &[false, false, true, false]),
            Some(4779)
        );
    }

    #[test]
    fn widget_settings_are_clamped_to_supported_ranges() {
        assert_eq!(
            normalize_widget_settings(serde_json::json!({"background": 120, "overall": 10})),
            serde_json::json!({"background": 100, "overall": 30, "autoDim": false})
        );
    }

    #[test]
    fn ctrl_alt_o_is_the_pressed_cursor_passthrough_toggle_shortcut() {
        let expected = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyO);
        let other = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyO);
        assert!(is_passthrough_hotkey(
            &expected,
            ShortcutState::Pressed
        ));
        assert!(!is_passthrough_hotkey(
            &expected,
            ShortcutState::Released
        ));
        assert!(!is_passthrough_hotkey(&other, ShortcutState::Pressed));
    }
}
