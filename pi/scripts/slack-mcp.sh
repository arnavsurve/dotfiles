#!/usr/bin/env bash
source "$(dirname "$0")/../secrets/slack.env"
exec /Users/asurve/dev/slack-mcp-server/build/slack-mcp-server
