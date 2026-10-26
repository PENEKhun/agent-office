use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{menu::CheckMenuItem, AppHandle, Manager, Wry};

const PIN_HIT_AREA_LOGICAL: f64 = 36.0;
const POLL_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Default)]
struct State {
    enabled: bool,
    ignoring_events: bool,
    tray_item: Option<CheckMenuItem<Wry>>,
}

#[derive(Clone, Default)]
pub struct CursorPassthroughController(Arc<Mutex<State>>);

impl CursorPassthroughController {
    pub fn is_enabled(&self) -> bool {
        self.0.lock().map(|state| state.enabled).unwrap_or(false)
    }

    pub fn set_tray_item(&self, item: CheckMenuItem<Wry>) {
        if let Ok(mut state) = self.0.lock() {
            let _ = item.set_checked(state.enabled);
            state.tray_item = Some(item);
        }
    }

    pub fn set(&self, app: &AppHandle<Wry>, enabled: bool) {
        let item = if let Ok(mut state) = self.0.lock() {
            state.enabled = enabled;
            state.tray_item.clone()
        } else {
            None
        };
        if let Some(item) = item {
            let _ = item.set_checked(enabled);
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval(&format!(
                "window.__agentOfficeSetCursorPassthrough?.({enabled})"
            ));
        }
        self.refresh_window(app);
    }

    pub fn refresh_window(&self, app: &AppHandle<Wry>) {
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let enabled = self.is_enabled();
        let inside_pin = window
            .cursor_position()
            .ok()
            .zip(window.inner_size().ok())
            .map(|(cursor, size)| {
                pin_hit_area_contains(
                    cursor.x,
                    cursor.y,
                    f64::from(size.width),
                    f64::from(size.height),
                    window.scale_factor().unwrap_or(1.0),
                )
            })
            .unwrap_or(false);
        let should_ignore = enabled && !inside_pin;
        let changed = if let Ok(mut state) = self.0.lock() {
            if state.ignoring_events == should_ignore {
                false
            } else {
                state.ignoring_events = should_ignore;
                true
            }
        } else {
            false
        };
        if changed {
            let _ = window.set_ignore_cursor_events(should_ignore);
        }
    }

    pub fn start_polling(&self, app: AppHandle<Wry>, stopping: Arc<AtomicBool>) {
        let controller = self.clone();
        thread::spawn(move || {
            while !stopping.load(Ordering::Relaxed) {
                controller.refresh_window(&app);
                thread::sleep(POLL_INTERVAL);
            }
        });
    }
}

fn pin_hit_area_contains(x: f64, y: f64, width: f64, height: f64, scale: f64) -> bool {
    let edge = PIN_HIT_AREA_LOGICAL * scale.max(1.0);
    x >= width - edge && x <= width && y >= 0.0 && y <= edge && height >= edge
}

#[cfg(test)]
mod tests {
    use super::pin_hit_area_contains;

    #[test]
    fn pin_hit_area_stays_at_the_top_right_corner() {
        assert!(pin_hit_area_contains(410.0, 10.0, 420.0, 300.0, 1.0));
        assert!(!pin_hit_area_contains(380.0, 10.0, 420.0, 300.0, 1.0));
        assert!(!pin_hit_area_contains(410.0, 40.0, 420.0, 300.0, 1.0));
        assert!(pin_hit_area_contains(820.0, 20.0, 840.0, 600.0, 2.0));
        assert!(!pin_hit_area_contains(820.0, 20.0, 420.0, 300.0, 2.0));
    }
}
