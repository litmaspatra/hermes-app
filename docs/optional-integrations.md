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

## Experimental manual service control

`phone/optional-service.sh` controls FastBrain's own PID/socket-based daemons. Hindsight Lite is not a daemon: it is an in-process Hermes memory provider installed inside Debian.

```bash
bash phone/optional-service.sh status fastbrain-router
bash phone/optional-service.sh status fastbrain-minilm
# Only after installing FastBrain's original scripts and marking executable:
bash phone/optional-service.sh start fastbrain-router
```

FastBrain must be installed separately before using these controls. The status checks verify PID and socket existence, not API readiness. The app currently has no UI for these services.

For Hindsight Lite, review the memory-provider source and run `bash phone/install-hindsight-lite.sh --install` in Termux only after Hermes Mobile is installed. The script enters Debian, selects the Hermes venv and invokes the existing rollback-aware Hindsight installer. It edits the Hermes memory provider config and requires a Hermes restart. No integration test on an actual phone has been completed.

## Development fork bootstrap

For a clean phone, you can explicitly select the fork and review branch before
executing its installer:

```bash
export HM_MOBILE_REPO=https://github.com/litmaspatra/hermes-app
export HM_MOBILE_REF=feature/mobile-reliability-integrations
curl -fsSL https://raw.githubusercontent.com/litmaspatra/hermes-app/feature/mobile-reliability-integrations/phone/bootstrap.sh -o hm.sh
# Review hm.sh before running. This modifies Termux/Debian and installs Hermes.
bash hm.sh
```

The Android APK is **not** produced by the bootstrap script. A rebuilt APK needs
its own signing key and cannot update the upstream signed app directly.

## Fresh install commands (explicit, separate)

From the cloned **development branch** in Termux, after core Hermes Mobile is healthy:

```bash
bash phone/install-fastbrain.sh             # preview, no changes
bash phone/install-fastbrain.sh --install   # requires Python 3.13 already present
bash phone/install-hindsight-lite.sh        # preview, no changes
bash phone/install-hindsight-lite.sh --install
```

FastBrain's installer runs its standalone doctor but **does not** enable the Hermes pre-router, MiniLM, or any start-at-boot service. Hindsight installs a memory provider in Debian and edits the memory-provider selection in Hermes; **restart Hermes** after completion. Both installations are user-triggered and neither executes from the normal Hermes Mobile bootstrap.

At present the app has **no settings UI** for these integrations. Hindsight Lite auto-recall and FastBrain routing must be validated separately before enabling interception of chat turns.
