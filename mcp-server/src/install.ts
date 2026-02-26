import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function getSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

function loadSettings(): Record<string, unknown> {
  const path = getSettingsPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function saveSettings(settings: Record<string, unknown>): void {
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

export function install(): void {
  console.log("Installing quick-screenshot-mcp for Claude Code...\n");

  const claudeConfigPath = join(homedir(), ".claude.json");
  if (!existsSync(claudeConfigPath)) {
    console.error(`Error: ${claudeConfigPath} not found.`);
    console.error("Is Claude Code installed?");
    process.exit(1);
  }

  const settings = loadSettings();
  const mcpServers = (settings.mcpServers as Record<string, unknown>) || {};

  mcpServers["quick-screenshot"] = {
    command: "quick-screenshot-mcp",
    args: [],
  };

  settings.mcpServers = mcpServers;
  saveSettings(settings);

  console.log("✓ Added quick-screenshot to Claude Code MCP servers\n");
  console.log("Next steps:");
  console.log("1. Restart Claude Code");
  console.log("2. Enable 'MCP Mode' in the Quick Screenshot extension");
  console.log("3. Test with: mcp__quick-screenshot__status\n");
}

export function uninstall(): void {
  console.log("Removing quick-screenshot-mcp from Claude Code...\n");

  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) {
    console.log("Nothing to remove.");
    return;
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const mcpServers = settings.mcpServers || {};

    if (mcpServers["quick-screenshot"]) {
      delete mcpServers["quick-screenshot"];
      settings.mcpServers = mcpServers;
      saveSettings(settings);
      console.log("✓ Removed quick-screenshot from Claude Code MCP servers\n");
    } else {
      console.log("quick-screenshot was not configured.");
    }
  } catch {
    console.error("Error reading settings file.");
  }
}
