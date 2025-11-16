#!/bin/bash
# MOSTLY AI GENERATED WITH SMALL TWEAKS
set -e

domain="$1"
web_server_name="$2"

if [[ -z "$domain" || -z "$web_server_name" ]]; then
  echo "usage: $0 <domain> <web_server_name>"
  exit 1
fi


# check that only ports 80 and 443 are listening (tcp)
open=$(netstat -tln | grep LISTEN | awk '{print $4}' | grep -oE '[0-9]+$' | sort -u | tr '\n' ' ' | sed 's/ $//')
if [[ "$open" == "80 443" ]]; then
  echo "PASS: only ports 80 and 443 are open"
else
  echo "FAIL: expected only ports 80 and 443 to be open, found: $open"
  exit 1
fi

# check for 200 from /apps/$web_server_name
url="http://$domain/apps/$web_server_name"
http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
if [[ "$http_code" == "200" ]]; then
  echo "PASS: 200 received from $url"
  exit 0
else
  echo "FAIL: expected 200 from $url, got $http_code"
  exit 2
fi