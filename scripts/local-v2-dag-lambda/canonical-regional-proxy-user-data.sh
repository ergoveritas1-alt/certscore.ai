#!/bin/bash
set -euxo pipefail

dnf install -y squid iptables-services

cat >/etc/squid/squid.conf <<'SQUID'
http_port 3128
acl vpcsrc src __CERTSCORE_LAMBDA_VPC_CIDR__
acl SSL_ports port 443 563 1024-65535
acl Safe_ports port 80 21 443 70 210 1024-65535 280 488 591 777
acl CONNECT method CONNECT
acl nonpublic_v4 dst 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4
acl nonpublic_v6 dst ::/128 ::1/128 2001:db8::/32 fc00::/7 fe80::/10 ff00::/8
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access deny nonpublic_v4
http_access deny nonpublic_v6
http_access allow vpcsrc
http_access deny all
forwarded_for delete
via off
visible_hostname __CERTSCORE_VISIBLE_HOSTNAME__
SQUID

SQUID_UID="$(id -u squid)"
iptables -I OUTPUT 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -I OUTPUT 2 -p udp --dport 53 -j ACCEPT
iptables -I OUTPUT 3 -p tcp --dport 53 -j ACCEPT
for CIDR in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4; do
  iptables -A OUTPUT -m owner --uid-owner "$SQUID_UID" -d "$CIDR" -j REJECT
done
ip6tables -I OUTPUT 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -I OUTPUT 2 -p udp --dport 53 -j ACCEPT
ip6tables -I OUTPUT 3 -p tcp --dport 53 -j ACCEPT
for CIDR in ::/128 ::1/128 2001:db8::/32 fc00::/7 fe80::/10 ff00::/8; do
  ip6tables -A OUTPUT -m owner --uid-owner "$SQUID_UID" -d "$CIDR" -j REJECT
done
iptables-save >/etc/sysconfig/iptables
ip6tables-save >/etc/sysconfig/ip6tables
systemctl enable iptables ip6tables
systemctl enable --now squid
