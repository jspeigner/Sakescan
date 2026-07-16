#!/usr/bin/env bash
# Configure Supabase Auth custom SMTP for production password-reset emails (B20).
#
# Built-in Supabase email ONLY delivers to organization team members and is
# capped at ~2 emails/hour. Production apps must use custom SMTP.
#
# Required env:
#   SUPABASE_ACCESS_TOKEN  - from https://supabase.com/dashboard/account/tokens
#   SMTP_HOST              - e.g. smtp.resend.com
#   SMTP_PORT              - e.g. 465 or 587
#   SMTP_USER              - e.g. resend
#   SMTP_PASS              - provider API key / SMTP password
#   SMTP_ADMIN_EMAIL       - e.g. noreply@sakescan.com (must be verified at provider)
#   SMTP_SENDER_NAME       - optional, default "SakeScan"
#
# Optional:
#   PROJECT_REF            - default qpsdebikkmcdzddhphlk
#   RATE_LIMIT_EMAIL_SENT  - default 100 (emails/hour after custom SMTP)

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-qpsdebikkmcdzddhphlk}"
SMTP_SENDER_NAME="${SMTP_SENDER_NAME:-SakeScan}"
RATE_LIMIT_EMAIL_SENT="${RATE_LIMIT_EMAIL_SENT:-100}"

missing=()
for var in SUPABASE_ACCESS_TOKEN SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_ADMIN_EMAIL; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if ((${#missing[@]} > 0)); then
  echo "Missing required env: ${missing[*]}" >&2
  echo "Example (Resend):" >&2
  echo "  export SMTP_HOST=smtp.resend.com SMTP_PORT=465 SMTP_USER=resend" >&2
  echo "  export SMTP_PASS=re_xxx SMTP_ADMIN_EMAIL=noreply@sakescan.com" >&2
  exit 1
fi

payload=$(python3 - <<PY
import json, os
print(json.dumps({
  "external_email_enabled": True,
  "smtp_host": os.environ["SMTP_HOST"],
  "smtp_port": int(os.environ["SMTP_PORT"]),
  "smtp_user": os.environ["SMTP_USER"],
  "smtp_pass": os.environ["SMTP_PASS"],
  "smtp_admin_email": os.environ["SMTP_ADMIN_EMAIL"],
  "smtp_sender_name": os.environ.get("SMTP_SENDER_NAME", "SakeScan"),
  "rate_limit_email_sent": int(os.environ.get("RATE_LIMIT_EMAIL_SENT", "100")),
  "site_url": "https://www.sakescan.com",
  "uri_allow_list": ",".join([
    "vibecode://auth/callback",
    "vibecode://reset-password",
    "vibecode://**",
    "https://sakescan.com/auth/callback",
    "https://www.sakescan.com/auth/callback",
    "https://sakescan.com/**",
    "https://www.sakescan.com/**",
  ]),
}))
PY
)

echo "Updating Auth SMTP for project ${PROJECT_REF}..."
resp=$(curl -sS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${payload}")

python3 - <<'PY' <<<"$resp"
import json,sys
cfg=json.load(sys.stdin)
if "message" in cfg and "smtp_host" not in cfg:
    print("ERROR:", cfg, file=sys.stderr)
    sys.exit(1)
print("smtp_host:", cfg.get("smtp_host"))
print("smtp_admin_email:", cfg.get("smtp_admin_email"))
print("smtp_sender_name:", cfg.get("smtp_sender_name"))
print("rate_limit_email_sent:", cfg.get("rate_limit_email_sent"))
print("site_url:", cfg.get("site_url"))
print("OK — custom SMTP configured. Test Forgot Password with a non-team email.")
PY
