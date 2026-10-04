"""Runs Hermes's cron scheduler on the phone (same ticker Hermes Desktop runs in its backend).

The phone runs `hermes dashboard`, not the messaging gateway, so without this daemon cron jobs
would never fire. Ticks every local profile's store every 60 s; the per-store tick lock makes it
safe next to any other scheduler.

Battery: nothing holds a permanent wake lock any more, so the phone sleeps between jobs and this
ticker sleeps with it. It reports the next due job to the Hermes app (`wake_at`), which sets an
alarm that wakes the phone for it; once the job runs, its status beats keep the phone awake.
"""
import json
import logging
import sys
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path

APP_URL = "http://127.0.0.1:9121/event"
KEY_FILE = Path("/data/data/com.termux/files/home/.hermes-mobile/key")
WAKE_CHECK = 60  # seconds between looks at the job stores (only while the phone is awake anyway)
WAKE_RESEND = 1200  # re-send an unchanged wake time now and then (alarms are lost on reboot/app update)


def _runnable(job: dict) -> bool:
    """Hermes's is_job_runnable plus terminal states (cron/jobs.py)."""
    if not job.get("enabled", True) or job.get("paused_at"):
        return False
    return str(job.get("state") or "").strip() not in ("paused", "completed", "error")


def next_wake(homes, now: float):
    """Earliest future next_run_at (epoch seconds) over the profiles' cron stores, or 0 when none is due."""
    best = 0.0
    for home in homes:
        try:
            data = json.loads((Path(home) / "cron" / "jobs.json").read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            continue
        jobs = data.get("jobs", []) if isinstance(data, dict) else data
        if isinstance(jobs, dict):
            jobs = list(jobs.values())
        for job in jobs if isinstance(jobs, list) else []:
            if not isinstance(job, dict) or not _runnable(job) or not job.get("next_run_at"):
                continue
            try:
                at = datetime.fromisoformat(str(job["next_run_at"]).replace("Z", "+00:00")).timestamp()
            except ValueError:
                continue
            if at > now and (not best or at < best):
                best = at
    return best


def _homes():
    try:
        from hermes_cli.profiles import profiles_to_serve
        return [home for _name, home in profiles_to_serve(multiplex=True)]  # the set the ticker ticks
    except Exception:
        root = Path("/root/.hermes")
        return [root, *sorted(p for p in (root / "profiles").glob("*") if (p / "config.yaml").exists())]


def _post(event: dict) -> bool:
    try:
        key = KEY_FILE.read_text().strip()
        req = urllib.request.Request(APP_URL, data=json.dumps(event).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "X-Hermes-Mobile-Key": key})
        with urllib.request.urlopen(req, timeout=2) as r:
            return r.status < 300
    except Exception:
        return False


def wake_reporter(stop: threading.Event) -> None:
    sent, sent_at = None, 0.0
    while not stop.is_set():
        try:
            at = next_wake(_homes(), time.time())
            if (at != sent or time.time() - sent_at > WAKE_RESEND) and _post({"kind": "wake_at", "at": at}):
                if at != sent:
                    logging.info("next wake %s", time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(at)) if at else "none")
                sent, sent_at = at, time.time()
        except Exception:
            logging.exception("wake reporter")
        stop.wait(WAKE_CHECK)


if __name__ == "__main__":
    sys.path.insert(0, "/root/.hermes/hermes-agent")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    from hermes_cli.web_server import _start_desktop_cron_ticker  # noqa: E402

    stop = threading.Event()
    threading.Thread(target=_start_desktop_cron_ticker, args=(stop,), daemon=True, name="cron-ticker").start()
    threading.Thread(target=wake_reporter, args=(stop,), daemon=True, name="wake-reporter").start()
    stop.wait()
