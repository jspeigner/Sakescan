#!/usr/bin/env bash
# Daily health check for SakeScan image import / backfill pipeline.
# Usage: ./scripts/check-image-import-health.sh [--json]
# Exit 0 = healthy enough to continue; 1 = stalled or action needed.
set -euo pipefail

STATS_URL="${SAKESCAN_STATS_URL:-https://www.sakescan.com/api/cron/backfill-orchestrator?stats=1}"
AUTH_HEADER="${SAKESCAN_STATS_AUTH_HEADER:-}"
AUTH_TOKEN="${SAKESCAN_STATS_BEARER_TOKEN:-${SAKESCAN_CRON_SECRET:-${CRON_SECRET:-}}}"
JSON_ONLY=false
if [[ "${1:-}" == "--json" ]]; then
  JSON_ONLY=true
fi

curl_args=(-sS --max-time 45)
if [[ -n "$AUTH_HEADER" ]]; then
  curl_args+=(-H "Authorization: $AUTH_HEADER")
elif [[ -n "$AUTH_TOKEN" ]]; then
  curl_args+=(-H "Authorization: Bearer $AUTH_TOKEN")
fi

raw="$(curl "${curl_args[@]}" "$STATS_URL")" || {
  echo "FAIL: could not reach stats endpoint ($STATS_URL)" >&2
  exit 1
}

report="$(python3 - "$raw" <<'PY'
import json, os, sys
from datetime import datetime, timezone

raw = sys.argv[1]
d = json.loads(raw)

endpoint_error = d.get("error")
has_stats_shape = isinstance(d.get("gaps"), dict) and isinstance(d.get("discoverHealth"), dict)

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

discover = d.get("latestDiscover") if isinstance(d.get("latestDiscover"), dict) else {}
promote = d.get("latestPromote") if isinstance(d.get("latestPromote"), dict) else {}
for log in logs:
    if log.get("job") != "backfill-orchestrator":
        continue
    for phase in (log.get("stats") or {}).get("phases") or []:
        if phase.get("phase") == "images-discover" and not discover:
            stats = phase.get("stats") or {}
            discover = stats.get("discoverHealth") or {}
            discover["_sakeDiscovered"] = stats.get("sakeDiscovered")
            discover["_openaiQuota"] = stats.get("openaiVisionQuotaExceeded")
            discover["_backoffCleared"] = stats.get("environmentalBackoffCleared")
            discover["_stopReason"] = stats.get("stopReason")
            discover["_timestamp"] = log.get("created_at")
        if phase.get("phase") == "promote-scan-images" and not promote:
            promote = phase.get("stats") or {}
            promote["_status"] = phase.get("status")
            promote["_timestamp"] = log.get("created_at")
    if discover and promote:
        break

placed = discover.get("placed", 0)
attempts = discover.get("attempts")
if attempts is None:
    attempts = discover.get("attemptedRows")
vision = discover.get("visionChecks", 0)
yield_rate = discover.get("yield")
firecrawl_err = discover.get("firecrawlErrors", 0)
pool_pages = discover.get("poolPagesScanned")
pool_rows = discover.get("poolRows")
eligible_rows = discover.get("eligibleRows")
skipped_by_backoff = discover.get("skippedByBackoff")
skipped_exhausted = discover.get("skippedExhausted")
promote_count = promote.get("promoted", 0)
skipped_unusable_url = promote.get("skippedUnusableUrl", promote.get("skippedInvalidUrl"))
openai_rec = env.get("openaiQuotaRecommendation")
discover_rec = env.get("discoverQuotaRecommendation")
last_summary = d.get("lastRunSummary") or {}
last_status = last.get("status") or last_summary.get("status")
errors = last.get("errors") or []
discover_stop_reason = discover.get("stopReason", discover.get("_stopReason"))
discover_run_at = discover.get("runAt", discover.get("_timestamp"))
promote_status = promote.get("status", promote.get("_status"))
promote_run_at = promote.get("runAt", promote.get("_timestamp"))

def parse_timestamp(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

def age_hours(run_at, as_of):
    parsed = parse_timestamp(run_at)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    delta = as_of - parsed.astimezone(timezone.utc)
    return max(0, delta.total_seconds() / 3600)

as_of = parse_timestamp(d.get("timestamp")) or datetime.now(timezone.utc)
if as_of.tzinfo is None:
    as_of = as_of.replace(tzinfo=timezone.utc)
else:
    as_of = as_of.astimezone(timezone.utc)
try:
    stale_discover_hours = float(os.environ.get("SAKESCAN_STALE_DISCOVER_HOURS", "72"))
except ValueError:
    stale_discover_hours = 72.0
discover_age_hours = age_hours(discover_run_at, as_of)
promote_age_hours = age_hours(promote_run_at, as_of)

alerts = []
if endpoint_error:
    alerts.append(f"Stats endpoint error: {endpoint_error}")
if not has_stats_shape:
    alerts.append("Stats response missing expected gaps/discoverHealth fields")
if skip.get("discover"):
    alerts.append("BACKFILL_SKIP_DISCOVER is set — discover phase disabled")
if skip.get("firecrawlQuotaExceeded"):
    alerts.append("FIRECRAWL_QUOTA_EXCEEDED bypass active")
if env.get("lastDiscoverOpenaiQuotaExceeded"):
    alerts.append("OpenAI vision quota exceeded on last discover run")
if env.get("lastDiscoverFirecrawlErrors", 0) >= 8:
    alerts.append(f"High Firecrawl errors ({env.get('lastDiscoverFirecrawlErrors')})")
if streak >= 20 and (yield_rate or 0) == 0 and promote_count == 0:
    alerts.append(f"Low-yield streak {streak} with zero recent yield — import may be stalled")
if (missing or 0) > 0:
    if discover_run_at is None:
        alerts.append("No discover run evidence while images are still missing")
    elif discover_age_hours is None:
        alerts.append(f"Could not parse latest discover run timestamp: {discover_run_at}")
    elif discover_age_hours is not None and discover_age_hours > stale_discover_hours:
        alerts.append(
            f"Latest discover run is stale ({discover_age_hours:.1f}h old; threshold {stale_discover_hours:.0f}h)"
        )
    if placed == 0 and not skip.get("discover"):
        if attempts is None or attempts == 0:
            alerts.append(
                f"Latest discover run placed 0 images and did not report attempts while {missing} images are still missing"
            )
        elif attempts > 0 and (yield_rate or 0) == 0:
            alerts.append(
                f"Latest discover run placed 0 images from {attempts} attempts while {missing} images are still missing"
            )
if last_status and last_status != "ok":
    alerts.append(f"Last orchestrator status: {last_status}")
if errors:
    alerts.append(f"Last run errors: {errors}")

healthy = (
    has_stats_shape
    and not alerts
    and (placed > 0 or promote_count > 0 or (yield_rate or 0) > 0 or streak < 20)
)

out = {
    "healthy": healthy,
    "endpointError": endpoint_error,
    "timestamp": d.get("timestamp"),
    "missingImage": missing,
    "lowYieldStreak": streak,
    "recentYields": yields[-5:],
    "latestDiscover": {
        "placed": placed,
        "attempts": attempts,
        "visionChecks": vision,
        "yield": yield_rate,
        "firecrawlErrors": firecrawl_err,
        "stopReason": discover_stop_reason,
        "runAt": discover_run_at,
        "ageHours": round(discover_age_hours, 1) if discover_age_hours is not None else None,
        "poolPagesScanned": pool_pages,
        "poolRows": pool_rows,
        "eligibleRows": eligible_rows,
        "skippedByBackoff": skipped_by_backoff,
        "skippedExhausted": skipped_exhausted,
    },
    "latestPromote": {
        "promoted": promote_count,
        "attempted": promote.get("attempted"),
        "skippedExisting": promote.get("skippedExisting"),
        "skippedUnusableUrl": skipped_unusable_url,
        "status": promote_status,
        "runAt": promote_run_at,
        "ageHours": round(promote_age_hours, 1) if promote_age_hours is not None else None,
    },
    "lastRunSummary": last_summary,
    "skipFlags": skip,
    "environmentalBackoffCleared": backoff_cleared,
    "openaiQuotaRecommendation": openai_rec,
    "discoverQuotaRecommendation": discover_rec,
    "alerts": alerts,
    "signals": {
        "trustedFirstFastMode": vision == 0 and placed > 0,
        "adaptiveDiscover": last.get("adaptiveDiscover") if last.get("adaptiveDiscover") is not None else last_summary.get("adaptiveDiscover"),
        "prioritizeDiscover": last.get("prioritizeDiscover") if last.get("prioritizeDiscover") is not None else last_summary.get("prioritizeDiscover"),
        "firecrawlBypassActive": env.get("firecrawlBypassActive"),
        "scanPromoteActive": promote_count > 0,
    },
}
print(json.dumps(out, indent=2))
PY
)" || {
  echo "FAIL: could not parse stats JSON" >&2
  python3 -c 'import sys; sys.stderr.write(sys.stdin.read()[:500])' <<< "$raw"
  exit 1
}

healthy="$(echo "$report" | python3 -c "import json,sys; print(json.load(sys.stdin)['healthy'])")"

if $JSON_ONLY; then
  echo "$report"
  if [[ "$healthy" == "True" ]]; then
    exit 0
  else
    exit 1
  fi
fi

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
