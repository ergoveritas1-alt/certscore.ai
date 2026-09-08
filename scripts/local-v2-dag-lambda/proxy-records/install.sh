#!/bin/bash
# Run on the existing regional proxy after copying collector.py and a 0600 key file.
# No proxy replacement, new capacity, TLS interception, or destination ACL changes.
set -euo pipefail
source_dir="${1:?source directory required}"
test -f "$source_dir/collector.py"
test "$(wc -c < "$source_dir/key")" -ge 32
command -v python3 >/dev/null
id certscore-records >/dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin certscore-records
install -d -m 750 -o root -g certscore-records /etc/certscore-proxy-records
install -m 640 -o root -g certscore-records "$source_dir/key" /etc/certscore-proxy-records/key
install -m 644 "$source_dir/collector.py" /etc/certscore-proxy-records/collector.py
cat > /etc/systemd/system/certscore-proxy-records.service <<'UNIT'
[Unit]
Description=CertScore bounded proxy destination records
After=network.target
[Service]
User=certscore-records
Group=certscore-records
Environment=CERTSCORE_PROXY_RECORDS_KEY_FILE=/etc/certscore-proxy-records/key
Environment=CERTSCORE_PROXY_RECORDS_BIND=0.0.0.0
ExecStart=/usr/bin/python3 /etc/certscore-proxy-records/collector.py
Restart=on-failure
MemoryMax=64M
TasksMax=12
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now certscore-proxy-records
# Authenticated readiness before Squid starts emitting records.
python3 - <<'PY'
import hashlib,hmac,http.client,json,time
key=open('/etc/certscore-proxy-records/key','rb').read().strip()
body=json.dumps({'version':1,'nonce':'0'*48,'ids':[]}).encode()
for attempt in range(10):
 try:
  c=http.client.HTTPConnection('127.0.0.1',43130,timeout=2)
  c.request('POST','/records',body,{'X-CertScore-Proof':hmac.new(key,body,hashlib.sha256).hexdigest()})
  r=c.getresponse(); assert r.status==200; break
 except OSError:
  if attempt==9: raise
  time.sleep(.1)
PY
# Permit only the collector's local UDP port through the existing Squid UID guard.
squid_uid="$(id -u squid)"
iptables -C OUTPUT -m owner --uid-owner "$squid_uid" -d 127.0.0.1 -p udp --dport 43129 -j ACCEPT 2>/dev/null || iptables -I OUTPUT 1 -m owner --uid-owner "$squid_uid" -d 127.0.0.1 -p udp --dport 43129 -j ACCEPT
iptables-save > /etc/sysconfig/iptables
cp -n /etc/squid/squid.conf /etc/squid/squid.conf.before-certscore-records || true
if ! grep -q '^logformat certscore_destination ' /etc/squid/squid.conf; then
cat >> /etc/squid/squid.conf <<'SQUID'
logformat certscore_destination %ts.%03tu %{X-CertScore-Tunnel}>h %rm %ru %>Hs %<a %Ss
acl certscore_destination_tag req_header X-CertScore-Tunnel ^[a-f0-9-]{36}$
access_log udp://127.0.0.1:43129 logformat=certscore_destination buffer-size=0KB certscore_destination_tag
SQUID
fi
squid -k parse
squid -k reconfigure
systemctl is-active certscore-proxy-records squid
