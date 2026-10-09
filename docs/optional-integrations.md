# Optional services: Hindsight Lite and FastBrain

Hermes Mobile runs Hermes in Debian under Termux. FastBrain's Android-aware
functions belong on the Termux side, and the previously used Hindsight Lite
Android wheel must not be installed blindly into Debian.

## Current status

This branch adds a **read-only preflight** (`phone/integration-doctor.sh`).
It does **not** yet bundle installers for Hindsight Lite or FastBrain.
Do not mark either integration as installed or operational until an actual
Termux-on-device test passes.

## Integration contract (proposed)

- Each optional service needs its own environment, process status, start/stop
  operation, health endpoint and logs.
- Never install into Hermes's Python environment or upgrade system Python.
- No always-on MiniLM or permanent CPU wake lock by default.
- Expose service controls only after authenticated loopback APIs exist.
- Keep the original Hermes services working when either integration is absent.
- Use request deadlines, bounded restarts and verified readiness before
  offering a service as available in the app.
- Never infer Hindsight identity solely from port 20128: it may be OmniRoute.

## Diagnostics

From Termux:

```bash
bash ~/hermes-mobile/phone/integration-doctor.sh
```

For an initial clean install, first run the regular Hermes Mobile installer.
To use a development fork of the plugin, set `HM_MOBILE_REPO` explicitly
for `phone/install.sh`, and run only after reviewing the script.

## Required validation before release

1. Fresh phone install of core Hermes and verify chat, voice and notifications.
2. Repeated screen-off/on and background WebSocket recovery tests.
3. Hindsight Lite Python ABI, memory-write and retrieval smoke tests.
4. FastBrain Android bridge, router response and MiniLM on-demand tests.
5. Sleep-current/battery comparison against upstream; no permanent wake lock.
6. Reboot, crashes, partial installation and uninstall behavior.

No provider token or credentials should be committed or printed in diagnostics.
