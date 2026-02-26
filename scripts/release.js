#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const BUMP_TYPES = ['patch', 'minor', 'major'];

function usage() {
  console.log(`
Usage: node scripts/release.js <patch|minor|major>

Examples:
  node scripts/release.js patch   # 0.1.0 -> 0.1.1
  node scripts/release.js minor   # 0.1.0 -> 0.2.0
  node scripts/release.js major   # 0.1.0 -> 1.0.0
`);
  process.exit(1);
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown bump type: ${type}`);
  }
}

function updateJsonFile(path, version) {
  const content = JSON.parse(readFileSync(path, 'utf-8'));
  const oldVersion = content.version;
  content.version = version;
  writeFileSync(path, JSON.stringify(content, null, 2) + '\n');
  return oldVersion;
}

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

// Parse args
const bumpType = process.argv[2];
if (!bumpType || !BUMP_TYPES.includes(bumpType)) {
  usage();
}

// Check clean git state
try {
  const status = execSync('git status --porcelain', { encoding: 'utf-8' });
  if (status.trim()) {
    console.error('Error: Working directory not clean. Commit or stash changes first.');
    process.exit(1);
  }
} catch {
  console.error('Error: Not a git repository');
  process.exit(1);
}

// Get current version and bump
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, bumpType);

console.log(`\nBumping version: ${oldVersion} -> ${newVersion}\n`);

// Update all version files
updateJsonFile('package.json', newVersion);
updateJsonFile('src/manifest.json', newVersion);
updateJsonFile('mcp-server/package.json', newVersion);

console.log('Updated:');
console.log('  - package.json');
console.log('  - src/manifest.json');
console.log('  - mcp-server/package.json');
console.log('');

// Build
run('npm run build');
run('cd mcp-server && npm run build');

// Git commit and tag
run('git add package.json src/manifest.json mcp-server/package.json');
run(`git commit -m "chore: release v${newVersion}"`);
run(`git tag v${newVersion}`);

console.log(`
Done! Release v${newVersion} created.

Next steps:
  git push && git push --tags
`);
