#!/usr/bin/env python3
"""
Scanalyzer desktop launcher: `python3 Web_Front/desktop.py` from the repository root.
Rebuilds the analyzer engine, then runs `npm run tauri dev` in Web_Front/.
"""

import os
import sys
import subprocess
import json

def clean_env():
    """Scrub snap env vars that break glibc and WebKit when launched from a snapped VS Code."""
    env = os.environ.copy()
    keys_to_delete = []
    for k, v in env.items():
        if k != "PATH" and "/snap/" in v:
            clean_paths = [p for p in v.split(os.pathsep) if "/snap/" not in p]
            if clean_paths:
                env[k] = os.pathsep.join(clean_paths)
            else:
                keys_to_delete.append(k)
    for k in keys_to_delete:
        del env[k]
    return env


def build_analyzer(web_front_dir, env):
    """Rebuild the analyzer CLI the desktop app shells out to.

    The desktop app does NOT analyze in-process — start_analysis (src-tauri) runs the
    prebuilt binary oa_sample_analyzer (handed over as SCAN_ANALYZER_BIN). `tauri dev`
    recompiles the Tauri crate but never that binary, so without this step the desktop
    keeps using a stale engine: every classifier, calibration and .PEAK-schema change
    would be invisible until the CLI is rebuilt by hand. `cargo build` is a no-op when
    nothing changed, so this is cheap on the common launch.

    THE CLI IS BUILT THROUGH THE TAURI CRATE'S OWN DEPENDENCY on oa-sample-analyzer
    (`-p oa-sample-analyzer --bin oa_sample_analyzer` against src-tauri/Cargo.toml), so it
    is exactly the analyzer the app links: the pinned git rev in a clone, the sibling
    PROCESSOR.SampleAnalyzer folder in the monorepo (Web_Front/.cargo/config.toml patches
    it). This used to build inside the `sample_analyzer_rs` symlink, which a clone of
    this repository did not have (audit 2026-10-30).
    """
    manifest = os.path.join(web_front_dir, "src-tauri", "Cargo.toml")
    print("Building the analyzer engine (PROCESSOR.SampleAnalyzer, release)...")
    try:
        subprocess.run(
            ["cargo", "build", "--release", "--manifest-path", manifest,
             "-p", "oa-sample-analyzer", "--bin", "oa_sample_analyzer"],
            cwd=web_front_dir,
            env=env,
            check=True,
        )
    except FileNotFoundError:
        print("\nError: 'cargo' not found. Install the Rust toolchain (https://rustup.rs).")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"\nError: the analyzer failed to compile (exit {e.returncode}). "
              "Fix the build above before launching, or the desktop app would run a stale engine.")
        sys.exit(e.returncode)

    binary = os.path.join(target_dir(os.path.dirname(manifest), env), "release", "oa_sample_analyzer")
    if not os.path.isfile(binary):
        print(f"Error: build reported success but {binary} is missing.")
        sys.exit(1)
    return binary


def target_dir(crate_dir, env):
    """Where cargo put the build: ask `cargo metadata`, never guess.

    The APK.audio checkout sets `[build] target-dir` in its root .cargo/config.toml, so the
    binary is NOT under <crate>/target there; `cargo metadata` reports the winner (that
    setting, or CARGO_TARGET_DIR). Falls back to <crate>/target only when the ask fails —
    a standalone clone with no override, where that IS where cargo writes.
    """
    try:
        out = subprocess.run(
            ["cargo", "metadata", "--format-version", "1", "--no-deps"],
            cwd=crate_dir, env=env, check=True, capture_output=True, text=True,
        ).stdout
        return json.loads(out)["target_directory"]
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError):
        return os.path.join(crate_dir, "target")


def main():
    # This file lives in Web_Front/.
    web_front_dir = os.path.dirname(os.path.abspath(__file__))

    if not os.path.isdir(web_front_dir):
        print(f"Error: Could not find the Web_Front directory at {web_front_dir}")
        sys.exit(1)

    env = clean_env()

    # WebKitGTK on Linux segfaults inside the Mesa/Gallium GL driver (libgallium) under its
    # accelerated DMABUF compositor — a webview+driver bug, NOT app code. It manifests as a
    # WebKitWebProcess SIGSEGV (the whole webview "crashes"), most readily on GPU-heavy views
    # like the Extractor's canvas waveforms and the 3D cloud's WebGL. Disabling the DMABUF
    # renderer routes compositing around the crashing path and is the standard fix for Tauri
    # apps on Linux. setdefault so an explicit override in the environment still wins.
    env.setdefault("WEBKIT_DISABLE_DMABUF_RENDERER", "1")

    # Rebuild the engine first, so the app that launches uses current code, not a stale
    # binary from a previous session.
    # start_analysis (src-tauri/src/lib.rs, analyzer_binary) spawns exactly this binary.
    env["SCAN_ANALYZER_BIN"] = build_analyzer(web_front_dir, env)

    print("\nLaunching the Scanalyzer Tauri App...")
    print("If this is your first time, it may take a few moments to compile the Rust backend.")

    try:
        # Launch the Tauri dev server from within the Web_Front directory
        subprocess.run(
            ["npm", "run", "tauri", "dev"], 
            cwd=web_front_dir, 
            env=env,
            check=True
        )
    except subprocess.CalledProcessError as e:
        # `tauri dev` returns a signal-death code when it's shut down rather than crashing:
        # 143 = SIGTERM (the app window was closed, or the debugger's Stop button was hit),
        # 130 = SIGINT (Ctrl-C). Those are normal exits, not failures — return cleanly so the
        # debugger doesn't surface a SystemExit "exception" on every ordinary shutdown.
        if e.returncode in (130, 143):
            print("\nScanalyzer closed.")
            return
        print(f"\nError: The Tauri application exited with code {e.returncode}")
        sys.exit(e.returncode)
    except FileNotFoundError:
        print("\nError: 'npm' command not found. Please ensure Node.js is installed.")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nExiting Scanalyzer.")

if __name__ == "__main__":
    main()
