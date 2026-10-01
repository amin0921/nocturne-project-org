RELEASE BUILD — Nocturne P0 CPU fixes

Context: the P0 idle-CPU fixes are implemented and verified in a debug build (idle 48% → ~1%). Now produce the production installer.

Do exactly this in the nocturne-tauri folder:
1. Close any running nocturne.exe first (it may lock files).
2. Bump version 0.1.1 → 0.1.2 in all three places, keeping them consistent: package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json. (Update Cargo.lock if cargo requires it.)
3. Run: npm run tauri build
   (RELEASE build — no --debug flag. It takes significantly longer than the debug build; wait for it to finish.)
   - If the build fails, stop and report the exact error. Do not invent fixes.
4. Reply with the exact path of the produced NSIS installer (expected: .../target/release/bundle/nsis/Nocturne_0.1.2_x64-setup.exe).

Rules: do not commit anything, do not modify any other file.
