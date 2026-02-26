#!/usr/bin/env node

import { install, uninstall } from "./install.js";
import { startServer } from "./server.js";

const VERSION = "0.1.0";

function showHelp(): void {
  console.log(`
quick-screenshot-mcp v${VERSION}

MCP server for Quick Screenshot Chrome extension.
Allows Claude Code to trigger screenshots via MCP protocol.

Usage:
  quick-screenshot-mcp              Start the MCP server (used by Claude Code)
  quick-screenshot-mcp --install    Configure Claude Code to use this server
  quick-screenshot-mcp --uninstall  Remove configuration from Claude Code
  quick-screenshot-mcp --help       Show this help
  quick-screenshot-mcp --version    Show version

Installation:
  npm install -g quick-screenshot-mcp
  quick-screenshot-mcp --install

Then restart Claude Code and enable "MCP Mode" in the extension.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "--help":
    case "-h":
      showHelp();
      break;

    case "--version":
    case "-v":
      console.log(VERSION);
      break;

    case "--install":
      install();
      break;

    case "--uninstall":
      uninstall();
      break;

    default:
      await startServer(VERSION);
      break;
  }
}

main().catch(console.error);
