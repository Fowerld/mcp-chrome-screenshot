# MCP Chrome Screenshot

Chrome extension for quick screenshots with MCP integration.

**Use-case**: Quickly capture screenshots and share them with Claude via the path in clipboard, or let Claude trigger captures itself via MCP.

## Quick Start

```bash
./install.sh
```

This builds everything and configures Claude Code. Then:

1. Load `dist/` in Chrome (`chrome://extensions` → Developer mode → Load unpacked)
2. Enable "MCP Mode" in the extension popup
3. Restart Claude Code in this project

Manual capture: `Ctrl+Shift+S`

## Documentation

See [INSTALL.md](INSTALL.md) for detailed installation steps and architecture.

## License

MIT
