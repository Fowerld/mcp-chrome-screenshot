interface MCPState {
  enabled: boolean;
  connected: boolean;
}

const mcpToggle = document.getElementById('mcp-toggle') as HTMLInputElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const statusConnected = document.getElementById('status-connected')!;
const statusDisconnected = document.getElementById('status-disconnected')!;
const statusDisabled = document.getElementById('status-disabled')!;
const installSection = document.getElementById('install-section')!;

const INSTALL_COMMAND = 'npm i -g quick-screenshot-mcp && quick-screenshot-mcp --install';

function updateUI(state: MCPState): void {
  mcpToggle.checked = state.enabled;

  // Hide all status
  statusConnected.classList.add('hidden');
  statusDisconnected.classList.add('hidden');
  statusDisabled.classList.add('hidden');
  installSection.classList.add('hidden');

  if (!state.enabled) {
    statusDisabled.classList.remove('hidden');
  } else if (state.connected) {
    statusConnected.classList.remove('hidden');
  } else {
    statusDisconnected.classList.remove('hidden');
    installSection.classList.remove('hidden');
  }
}

async function getMCPState(): Promise<MCPState> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_MCP_STATE' }, (response: MCPState) => {
      resolve(response || { enabled: false, connected: false });
    });
  });
}

async function setMCPEnabled(enabled: boolean): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'SET_MCP_ENABLED', enabled }, () => {
      resolve();
    });
  });
}

// Initialize
getMCPState().then(updateUI);

// Toggle MCP mode
mcpToggle.addEventListener('change', async () => {
  await setMCPEnabled(mcpToggle.checked);
  // Wait a bit for connection attempt
  setTimeout(async () => {
    const state = await getMCPState();
    updateUI(state);
  }, 500);
});

// Copy command
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 2000);
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = INSTALL_COMMAND;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 2000);
  }
});

// Listen for state changes
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'MCP_STATE_CHANGED') {
    updateUI(message.state);
  }
});
