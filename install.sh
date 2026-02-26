#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_SERVER_PATH="$SCRIPT_DIR/mcp-server/dist/cli.js"
WS_PORT=9876

echo "=== Quick Screenshot MCP Installation ==="
echo ""

# 1. Build extension
echo "[1/4] Building Chrome extension..."
cd "$SCRIPT_DIR"
npm install --silent
npm run build --silent
echo "      Done: dist/ ready"

# 2. Build MCP server
echo "[2/4] Building MCP server..."
cd "$SCRIPT_DIR/mcp-server"
npm install --silent
npm run build --silent
echo "      Done: mcp-server/dist/ ready"

# 3. Kill any orphan MCP server on port 9876
echo "[3/4] Checking for orphan processes on port $WS_PORT..."
ORPHAN_PID=$(ss -tlnp 2>/dev/null | grep ":$WS_PORT" | grep -oP 'pid=\K[0-9]+' || true)
if [ -n "$ORPHAN_PID" ]; then
    echo "      Killing orphan process (PID $ORPHAN_PID)..."
    kill "$ORPHAN_PID" 2>/dev/null || true
    sleep 1
fi
echo "      Done: port $WS_PORT free"

# 4. Configure Claude Code
echo "[4/4] Configuring Claude Code..."
CLAUDE_CONFIG="$HOME/.claude.json"

if [ ! -f "$CLAUDE_CONFIG" ]; then
    echo "      Error: $CLAUDE_CONFIG not found. Is Claude Code installed?"
    exit 1
fi

# Add MCP server to project config
PROJECT_PATH="$SCRIPT_DIR"
MCP_CONFIG="{\"command\": \"node\", \"args\": [\"$MCP_SERVER_PATH\"]}"

# Use jq to update config
if command -v jq &> /dev/null; then
    # Ensure project entry exists
    jq --arg path "$PROJECT_PATH" \
       --argjson mcp "$MCP_CONFIG" \
       '.projects[$path].mcpServers["quick-screenshot"] = $mcp' \
       "$CLAUDE_CONFIG" > "$CLAUDE_CONFIG.tmp" && mv "$CLAUDE_CONFIG.tmp" "$CLAUDE_CONFIG"
    echo "      Done: MCP server registered for $PROJECT_PATH"
else
    echo "      Warning: jq not installed. Please add manually to $CLAUDE_CONFIG:"
    echo ""
    echo "      \"projects\": {"
    echo "        \"$PROJECT_PATH\": {"
    echo "          \"mcpServers\": {"
    echo "            \"quick-screenshot\": $MCP_CONFIG"
    echo "          }"
    echo "        }"
    echo "      }"
    echo ""
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Manual steps remaining:"
echo ""
echo "1. Load extension in Chrome:"
echo "   - Open chrome://extensions"
echo "   - Enable 'Developer mode'"
echo "   - Click 'Load unpacked' -> select: $SCRIPT_DIR/dist/"
echo ""
echo "2. Enable MCP Mode in extension:"
echo "   - Click the Quick Screenshot icon in Chrome"
echo "   - Toggle 'MCP Mode' ON"
echo ""
echo "3. Restart Claude Code in this project:"
echo "   cd $SCRIPT_DIR && claude"
echo ""
echo "4. Test with: mcp__quick-screenshot__status"
echo ""
