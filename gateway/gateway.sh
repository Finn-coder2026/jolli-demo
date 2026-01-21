#!/bin/bash
# Gateway control script
# Usage: ./gateway.sh [start|stop|reload|test]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

case "$1" in
  start)
    nginx -p "$SCRIPT_DIR" -c nginx.conf
    ;;
  stop)
    nginx -p "$SCRIPT_DIR" -c nginx.conf -s stop
    ;;
  reload)
    nginx -p "$SCRIPT_DIR" -c nginx.conf -s reload
    ;;
  test)
    nginx -p "$SCRIPT_DIR" -t -c nginx.conf
    ;;
  *)
    echo "Usage: $0 {start|stop|reload|test}"
    exit 1
    ;;
esac
