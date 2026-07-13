#!/usr/bin/env bash
# Daily health check for SakeScan image import / backfill pipeline.
# Usage: ./scripts/check-image-import-health.sh [--json]
# Exit 0 = healthy enough to continue; 1 = stalled or action needed.
set -euo pipefail

STATS_URL="${SAKESCAN_STATS_URL:-https://www.sakescan.com/api/cron/backfill-orchestrator?stats=1}"
JSON_ONLY=false
if [[ "${1:-}" == "--json" ]]; then
  JSON_ONLY=true
fi

raw="$(curl -sS --max-time 45 "$STATS_URL")" || {
  echo "FAIL: could not reach stats endpoint ($STATS_URL)" >&2
  exit 1
}

report="$(python3 - "$raw" <<'PY'
import json, sys

raw = sys.argv[1]
d = json.loads(raw)

gaps = d.get("gaps") or {}
dh = d.get("discoverHealth") or {}
last = d.get("lastRun") or {}
env = d.get("env") or {}
logs = d.get("recentLogs") or []

missing = gaps.get("missingImage")
yields = dh.get("yields") or []
streak = dh.get("lowYieldStreak", 0)
skip = env.get("skipFlags") or last.get("skipFlags") or {}
backoff_cleared = last.get("environmentalBackoffCleared", 0)

discover = {}
for log in logs:
    if log.get("job") != "backfill-orchestrator":
        continue
    for phase in (log.get("stats") or {}).get("phases") or []:
        if phase.get("phase") == "images-discover":
            stats = phase.get("stats") or {}
            discover = stats.get("discoverHealth") or {}
            discover["_sakeDiscovered"] = stats.get("sakeDiscovered")
            discover["_openaiQuota"] = stats.get("openaiVisionQuotaExceeded")
            discover["_backoffCleared"] = stats.get("environmentalBackoffCleared")
            discover["_stopReason"] = stats.get("stopReason")
            discover["_timestamp"] = log.get("created_at")
            break
    if discover:
        break

placed = discover.get("placed", 0)
vision = discover.get("visionChecks", 0)
yield_rate = discover.get("yield")
firecrawl_err = discover.get("firecrawlErrors", 0)
openai_rec = env.get("openaiQuotaRecommendation")
discover_rec = env.get("discoverQuotaRecommendation")
last_status = last.get("status")
errors = last.get("errors") or []

alerts = []
if skip.get("discover"):
    alerts.append("BACKFILL_SKIP_DISCOVER is set — discover phase disabled")
if skip.get("firecrawlQuotaExceeded"):
    alerts.append("FIRECRAWL_QUOTA_EXCEEDED bypass active")
if env.get("lastDiscoverOpenaiQuotaExceeded"):
    alerts.append("OpenAI vision quota exceeded on last discover run")
if env.get("lastDiscoverFirecrawlErrors", 0) >= 8:
    alerts.append(f"High Firecrawl errors ({env.get('lastDiscoverFirecrawlErrors')})")
if streak >= 20 and (yield_rate or 0) == 0:
    alerts.append(f"Low-yield streak {streak} with zero recent yield — import may be stalled")
if last_status and last_status != "ok":
    alerts.append(f"Last orchestrator status: {last_status}")
if errors:
    alerts.append(f"Last run errors: {errors}")

healthy = not alerts and (placed > 0 or (yield_rate or 0) > 0 or streak < 20)

out = {
    "healthy": healthy,
    "timestamp": d.get("timestamp"),
    "missingImage": missing,
    "lowYieldStreak": streak,
    "recentYields": yields[-5:],
    "latestDiscover": {
        "placed": placed,
        "visionChecks": vision,
        "yield": yield_rate,
        "firecrawlErrors": firecrawl_err,
        "stopReason": discover.get("_stopReason"),
        "runAt": discover.get("_timestamp"),
    },
    "skipFlags": skip,
    "environmentalBackoffCleared": backoff_cleared,
    "openaiQuotaRecommendation": openai_rec,
    "discoverQuotaRecommendation": discover_rec,
    "alerts": alerts,
    "signals": {
        "trustedFirstFastMode": vision == 0 and placed > 0,
        "adaptiveDiscover": last.get("adaptiveDiscover"),
        "prioritizeDiscover": last.get("prioritizeDiscover"),
        "firecrawlBypassActive": env.get("firecrawlBypassActive"),
    },
}
print(json.dumps(out, indent=2))
sys.exit(0 if healthy else 1)
PY
)" || {
  echo "FAIL: could not parse stats JSON" >&2
  echo "$raw" | head -c 500 >&2
  exit 1
}

if $JSON_ONLY; then
  echo "$report"
  exit $?
fi

healthy="$(echo "$report" | python3 -c "import json,sys; print(json.load(sys.stdin)['healthy'])")"
echo "=== SakeScan image import health ==="
echo "$report"
echo
if [[ "$healthy" == "True" ]]; then
  echo "RESULT: OK — pipeline running (see metrics above)"
  exit 0
else
  echo "RESULT: ATTENTION — review alerts above"
  exit 1
fi
