#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "HearSay Chrome extension"
echo "========================"
echo ""
echo "Chrome cannot auto-install extensions from a download."
echo "This opens Extensions and this folder — use Load unpacked in Chrome."
echo ""
open -a "Google Chrome" "chrome://extensions" 2>/dev/null || open "chrome://extensions"
open .
read -r -p "Press Enter to close…" _
