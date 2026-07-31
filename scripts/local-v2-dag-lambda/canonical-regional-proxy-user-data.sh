#!/bin/bash
set -euxo pipefail

dnf install -y squid

cat >/etc/squid/squid.conf <<'SQUID'
http_port 3128
acl vpcsrc src 172.31.0.0/16
http_access allow vpcsrc
http_access deny all
forwarded_for delete
via off
visible_hostname __CERTSCORE_VISIBLE_HOSTNAME__
SQUID

systemctl enable --now squid

