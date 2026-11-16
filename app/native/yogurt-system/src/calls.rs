//! `yogurt-system call-watch MS ID...`: who is in a call and who is talking, as the call app shows it through
//! AT-SPI, one JSON line per reading (the same shape as yogurt-mac's call-watch). Linux only.

use std::fs;
use std::io::Read;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::atspi::{window_role, A11y, App};
use crate::call::{call_window, is_call_tree, kind, now_ms, Kind};

/// The watch: read the apps asked about every `every_ms`, until Yogurt closes stdin (or dies, which closes it too)
pub fn watch(every_ms: u64, ids: &[String]) -> ! {
    std::thread::spawn(|| {
        let mut sink = Vec::new();
        let _ = std::io::stdin().read_to_end(&mut sink);
        std::process::exit(0);
    });
    let every = every_ms.max(100);
    // the bus is found and connected once: a reading every 400 ms must not pay for a handshake each time
    let mut a11y: Option<A11y> = None;
    let mut complained = false;
    loop {
        let started = Instant::now();
        if a11y.is_none() {
            match A11y::connect() {
                Ok(a) => {
                    a11y = Some(a);
                    complained = false;
                }
                Err(e) => {
                    if !complained {
                        eprintln!("call-watch: {e}");
                        complained = true;
                    }
                }
            }
        }
        let line = match &a11y {
            Some(a) => match read_once(a, ids) {
                Ok(v) => v,
                Err(e) => {
                    if !complained {
                        eprintln!("call-watch: {e}");
                        complained = true;
                    }
                    a11y = None;
                    json!({ "t": now_ms(), "error": "no-accessibility" })
                }
            },
            None => json!({ "t": now_ms(), "error": "no-accessibility" }),
        };
        crate::out(line);
        // a slow app (a big page) is read less often, so the reading never takes much of the computer
        let took = started.elapsed().as_millis() as u64;
        std::thread::sleep(Duration::from_millis(every.max(took * 2).saturating_sub(took)));
    }
}

/// one reading stops walking after this long: an app that stopped answering cannot hold the watch for minutes
const READ_DEADLINE: Duration = Duration::from_millis(1500);
/// how much of a Teams window to read before trusting it is a call (the measured call has its Leave button within ~200)
const CALL_PROBE: i32 = 1200;

fn read_once(a11y: &A11y, ids: &[String]) -> Result<Value, String> {
    let t = now_ms();
    let deadline = Instant::now() + READ_DEADLINE;
    let apps = a11y.apps()?;
    let mut seen = false;
    let mut timed_out = false;
    // the first matching app with a call window is reported: the watch is for the meeting's app, not a survey of all
    for app in &apps {
        if Instant::now() >= deadline {
            timed_out = true;
            break;
        }
        let Some(pid) = a11y.pid(&app.bus) else { continue };
        let Some(id) = matched_id(pid, ids) else { continue };
        seen = true;
        let kind = kind(&id);
        let windows = windows(a11y, app, kind, deadline);
        if !windows.is_empty() {
            return Ok(json!({ "t": t, "app": id, "windows": windows }));
        }
    }
    Ok(if seen || timed_out {
        json!({ "t": t, "error": "no-call-window" })
    } else {
        json!({ "t": t, "error": "not-running" })
    })
}

/// The call windows of one app, in the shape src/main/callNames/parse.ts reads
fn windows(a11y: &A11y, app: &App, kind: Kind, deadline: Instant) -> Vec<Value> {
    let mut budget: i32 = if kind == Kind::Zoom { 1500 } else { 4000 };
    let max_depth = if kind == Kind::Zoom { 14 } else { 40 };
    let mut out = Vec::new();
    for (bus, path) in a11y.children(&app.bus, &app.path) {
        if out.len() == 4 || budget <= 0 || Instant::now() >= deadline {
            break;
        }
        let Some(role) = a11y.role(&bus, &path) else { continue };
        if !window_role(&role) {
            continue;
        }
        let title = a11y.name(&bus, &path).unwrap_or_default();
        if !call_window(kind, &title) {
            continue;
        }
        // Teams keeps its calendar and chat in windows shaped like the call's: read a little of the tree first and
        // only copy it out when the call controls are there, so that text never reaches the JSON or the log
        let tree = if kind == Kind::Teams {
            let mut probe = CALL_PROBE;
            let probe_tree = a11y.node(&bus, &path, 0, max_depth, &mut probe, deadline);
            if !is_call_tree(&probe_tree) {
                continue;
            }
            if probe > 0 {
                probe_tree
            } else {
                let mut budget = 4000;
                a11y.node(&bus, &path, 0, max_depth, &mut budget, deadline)
            }
        } else {
            a11y.node(&bus, &path, 0, max_depth, &mut budget, deadline)
        };
        out.push(json!({ "title": title, "tree": tree }));
    }
    out
}

/// The id asked about that this process is: its Flatpak app id, else its program name
fn matched_id(pid: u32, ids: &[String]) -> Option<String> {
    if let Some(id) = matched_id_here(pid, ids) {
        return Some(id);
    }
    // A sandboxed app's accessibility tree can be exported by its xdg-dbus-proxy, whose program name is not the
    // app's. Its cgroup normally names the Flatpak app; if that is gone, one level up is the app's own process.
    matched_id_here(parent_pid(pid)?, ids)
}

fn matched_id_here(pid: u32, ids: &[String]) -> Option<String> {
    if let Some(flatpak) = flatpak_id(pid) {
        if let Some(id) = ids.iter().find(|id| **id == flatpak) {
            return Some(id.clone());
        }
    }
    let program = program_name(pid)?;
    ids.iter().find(|id| **id == program).cloned()
}

fn parent_pid(pid: u32) -> Option<u32> {
    parent_pid_from_status(&fs::read_to_string(format!("/proc/{pid}/status")).ok()?)
}

fn parent_pid_from_status(status: &str) -> Option<u32> {
    status.lines().find_map(|line| line.strip_prefix("PPid:").and_then(|rest| rest.trim().parse().ok()))
}

/// A Flatpak app runs in its own cgroup: app-flatpak-com.example.App-<instance>.scope
/// (a real scope always has the instance; without one the whole id is kept)
fn flatpak_id(pid: u32) -> Option<String> {
    let cgroup = fs::read_to_string(format!("/proc/{pid}/cgroup")).ok()?;
    flatpak_id_from_cgroup(&cgroup)
}

fn flatpak_id_from_cgroup(cgroup: &str) -> Option<String> {
    for line in cgroup.lines() {
        let Some(rest) = line.split("app-flatpak-").nth(1) else { continue };
        let id = rest.rsplit_once('-').map(|(id, _)| id).unwrap_or(rest);
        let id = id.strip_suffix(".scope").unwrap_or(id);
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

/// The program's file name: /app/teams-for-linux/teams-for-linux, /usr/lib/firefox/firefox
fn program_name(pid: u32) -> Option<String> {
    let cmd = fs::read(format!("/proc/{pid}/cmdline")).ok()?;
    program_name_of(&cmd).or_else(|| fs::read_to_string(format!("/proc/{pid}/comm")).ok().map(|s| s.trim().to_string()))
}

fn program_name_of(cmdline: &[u8]) -> Option<String> {
    let first = cmdline.split(|b| *b == 0).next()?;
    let first = String::from_utf8_lossy(first);
    let base = first.rsplit('/').next().unwrap_or("");
    (!base.is_empty()).then(|| base.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_flatpak_id_comes_from_the_cgroup() {
        let line = "0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-flatpak-com.github.IsmaelMartinez.teams_for_linux-1512112203.scope";
        assert_eq!(flatpak_id_from_cgroup(line).as_deref(), Some("com.github.IsmaelMartinez.teams_for_linux"));
        assert_eq!(
            flatpak_id_from_cgroup("0::/user.slice/user-1000.slice/app-flatpak-com.spotify.Client-42.scope").as_deref(),
            Some("com.spotify.Client")
        );
        assert_eq!(flatpak_id_from_cgroup("0::/user.slice/user-1000.slice/session-3.scope"), None);
    }

    #[test]
    fn a_parent_pid_comes_from_status() {
        assert_eq!(parent_pid_from_status("Name:\tbash\nPPid:\t1234\n"), Some(1234));
        assert_eq!(parent_pid_from_status("Name:\tbash\n"), None);
        assert_eq!(parent_pid_from_status("PPid:\tabc\n"), None);
    }

    #[test]
    fn the_program_name_is_the_file_name() {
        assert_eq!(program_name_of(b"/app/teams-for-linux/teams-for-linux\0--ozone-platform=wayland\0").as_deref(), Some("teams-for-linux"));
        assert_eq!(program_name_of(b"/usr/lib/firefox/firefox\0").as_deref(), Some("firefox"));
        assert_eq!(program_name_of(b"\0"), None);
    }
}
