import type { CaptureMode, ExtensionState, Message, Settings, SelectionRect } from './types';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

// Default settings
const DEFAULT_SETTINGS: Settings = {
  defaultFormat: 'png',
  jpegQuality: 92,
  downloadFolder: '',
  filenamePattern: 'screenshot-{timestamp}',
  copyPathToClipboard: true,
};

// Extension state
let state: ExtensionState = {
  lastMode: 'visible',
  isCapturing: false,
  previewActive: false,
};

// Initialize state from storage
chrome.storage.local.get(['lastMode', 'settings'], (result) => {
  if (result.lastMode) {
    state.lastMode = result.lastMode;
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-screenshot') {
    await handleCaptureCommand();
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  switch (message.type) {
    case 'AREA_SELECTED':
      handleAreaCapture(message.rect, sender.tab?.id, message.format);
      break;
    case 'PREVIEW_READY':
      // Content script is ready for preview
      break;
    case 'MODE_CHANGED':
      if (message.mode) {
        saveLastMode(message.mode);
      }
      break;
    case 'PREVIEW_CANCELLED':
      state.previewActive = false;
      break;
    case 'CAPTURE_VISIBLE':
      (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await captureVisible(tab.id, message.format);
        }
        state.previewActive = false;
      })();
      break;
  }
  // No async response needed
});

// Main capture command handler
async function handleCaptureCommand(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  if (state.previewActive) {
    // Second press: capture now
    await captureVisible(tab.id);
    state.previewActive = false;
  } else {
    // First press: show preview
    state.previewActive = true;
    await showPreview(tab.id, state.lastMode);
  }
}

// Show capture preview overlay
async function showPreview(tabId: number, mode: CaptureMode): Promise<void> {
  // Inject content script programmatically (handles pages opened before extension install)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch (e) {
    // Script might already be injected, that's fine
  }

  // Small delay to ensure script is ready
  await new Promise(r => setTimeout(r, 50));

  await chrome.tabs.sendMessage(tabId, {
    type: 'START_PREVIEW',
    mode,
  } as Message);
}

// Capture visible tab
async function captureVisible(tabId: number, format?: string): Promise<void> {
  try {
    state.isCapturing = true;

    const settings = await getSettings();
    const useFormat = format || settings.defaultFormat;

    // Chrome only supports png and jpeg for capture
    const captureFormat = useFormat === 'jpeg' ? 'jpeg' : 'png';
    const dataUrl = await chrome.tabs.captureVisibleTab({
      format: captureFormat,
      quality: settings.jpegQuality,
    });

    // Convert to GIF if needed
    const finalDataUrl = useFormat === 'gif'
      ? await convertToGif(dataUrl)
      : dataUrl;

    await saveScreenshot(finalDataUrl, { ...settings, defaultFormat: useFormat as any });
  } catch (error) {
    console.error('Capture failed:', error);
  } finally {
    state.isCapturing = false;
  }
}

// Handle area selection capture
async function handleAreaCapture(rect: SelectionRect, tabId?: number, format?: string): Promise<void> {
  if (!tabId) {
    return;
  }

  try {
    state.isCapturing = true;
    const settings = await getSettings();
    const useFormat = format || settings.defaultFormat;

    // Save last area rect for next time
    await chrome.storage.local.set({ lastAreaRect: rect });

    // Capture full visible tab first
    const dataUrl = await chrome.tabs.captureVisibleTab({
      format: 'png', // Always PNG for cropping quality
    });

    // Crop to selection
    const croppedDataUrl = await cropImage(dataUrl, rect);

    // Convert to desired format if needed
    let finalDataUrl = croppedDataUrl;
    if (useFormat === 'jpeg' || useFormat === 'webp') {
      finalDataUrl = await convertFormat(croppedDataUrl, useFormat, settings.jpegQuality);
    } else if (useFormat === 'gif') {
      finalDataUrl = await convertToGif(croppedDataUrl);
    }

    await saveScreenshot(finalDataUrl, { ...settings, defaultFormat: useFormat as any });
  } catch (error) {
    console.error('Area capture failed:', error);
  } finally {
    state.isCapturing = false;
    state.previewActive = false;
  }
}

// Crop image to selection rectangle
async function cropImage(dataUrl: string, rect: SelectionRect): Promise<string> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(rect.width, rect.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(
    bitmap,
    rect.x, rect.y, rect.width, rect.height,
    0, 0, rect.width, rect.height
  );

  const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(resultBlob);
}

// Convert to GIF (static)
async function convertToGif(dataUrl: string): Promise<string> {
  const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  const palette = quantize(data, 256);
  const gif = GIFEncoder();
  gif.writeFrame(applyPalette(data, palette), width, height, { palette });
  gif.finish();

  return blobToDataUrl(new Blob([gif.bytes()], { type: 'image/gif' }));
}

// Decode base64 dataUrl to Blob (no fetch)
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

// Convert image format
async function convertFormat(
  dataUrl: string,
  format: 'jpeg' | 'webp',
  quality: number
): Promise<string> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(bitmap, 0, 0);

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
  const resultBlob = await canvas.convertToBlob({
    type: mimeType,
    quality: quality / 100,
  });

  return blobToDataUrl(resultBlob);
}

// Convert blob to data URL
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Save screenshot and copy path to clipboard
async function saveScreenshot(dataUrl: string, settings: Settings): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const extension = settings.defaultFormat;
  const filename = `${settings.filenamePattern.replace('{timestamp}', timestamp)}.${extension}`;

  const fullFilename = settings.downloadFolder
    ? `${settings.downloadFolder}/${filename}`
    : filename;

  // Download the file
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename: fullFilename,
    saveAs: false,
    conflictAction: 'uniquify',
  });

  // Get the final path
  const downloadPath = await getDownloadPath(downloadId);

  if (settings.copyPathToClipboard && downloadPath) {
    await copyToClipboard(downloadPath);

    // Notify content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'CAPTURE_COMPLETE',
        path: downloadPath,
      } as Message);
    }
  }
}

// Get download path (best effort)
async function getDownloadPath(downloadId: number): Promise<string | null> {
  return new Promise((resolve) => {
    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === downloadId && delta.state?.current === 'complete') {
        chrome.downloads.onChanged.removeListener(listener);

        // Query for the download to get filename
        chrome.downloads.search({ id: downloadId }, (downloads) => {
          if (downloads.length > 0 && downloads[0].filename) {
            resolve(downloads[0].filename);
          } else {
            resolve(null);
          }
        });
      }
    };
    chrome.downloads.onChanged.addListener(listener);

    // Timeout fallback
    setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      resolve(null);
    }, 5000);
  });
}

// Copy text to clipboard
async function copyToClipboard(text: string): Promise<void> {
  // In service worker, we need to use offscreen document or messaging
  // For now, we'll use the content script to copy
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (textToCopy: string) => {
        navigator.clipboard.writeText(textToCopy);
      },
      args: [text],
    });
  }
}

// Get settings from storage
async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

// Save last mode
async function saveLastMode(mode: CaptureMode): Promise<void> {
  state.lastMode = mode;
  await chrome.storage.local.set({ lastMode: mode });
}

// ============================================
// MCP Bridge - WebSocket client
// ============================================

const MCP_WS_URL = 'ws://localhost:9876';
const MCP_KEEPALIVE_ALARM = 'mcp-keepalive';
const MCP_INACTIVITY_ALARM = 'mcp-inactivity';
const MCP_INACTIVITY_TIMEOUT_MIN = 10;

let mcpSocket: WebSocket | null = null;
let mcpReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let mcpModeEnabled = false;

interface MCPCaptureRequest {
  type: 'capture';
  id: string;
  mode: 'visible' | 'area';
  format: 'png' | 'jpeg' | 'webp' | 'gif';
  area?: { x: number; y: number; width: number; height: number };
  quality?: number;
}

function connectToMCP(): void {
  if (!mcpModeEnabled) {
    return;
  }

  if (mcpSocket?.readyState === WebSocket.OPEN) {
    return;
  }

  try {
    mcpSocket = new WebSocket(MCP_WS_URL);

    mcpSocket.onopen = () => {
      console.log('[MCP] Connected to MCP server');
      if (mcpReconnectTimer) {
        clearTimeout(mcpReconnectTimer);
        mcpReconnectTimer = null;
      }
      updateMCPBadge(true);
    };

    mcpSocket.onmessage = async (event) => {
      try {
        const request = JSON.parse(event.data) as MCPCaptureRequest;
        if (request.type === 'capture') {
          resetInactivityTimer();
          await handleMCPCapture(request);
        }
      } catch (e) {
        console.error('[MCP] Failed to handle message:', e);
      }
    };

    mcpSocket.onclose = () => {
      console.log('[MCP] Disconnected from MCP server');
      mcpSocket = null;
      if (mcpModeEnabled) {
        updateMCPBadge(false);
        scheduleMCPReconnect();
      }
    };

    mcpSocket.onerror = () => {
      // Error will trigger close, which handles reconnect
      mcpSocket?.close();
    };
  } catch (e) {
    console.error('[MCP] Connection failed:', e);
    scheduleMCPReconnect();
  }
}

function scheduleMCPReconnect(): void {
  if (!mcpModeEnabled || mcpReconnectTimer) {
    return;
  }
  mcpReconnectTimer = setTimeout(() => {
    mcpReconnectTimer = null;
    connectToMCP();
  }, 5000);
}

function disconnectFromMCP(): void {
  if (mcpReconnectTimer) {
    clearTimeout(mcpReconnectTimer);
    mcpReconnectTimer = null;
  }
  if (mcpSocket) {
    mcpSocket.close();
    mcpSocket = null;
  }
}

// ============================================
// MCP Mode Management
// ============================================

async function enableMCPMode(): Promise<void> {
  mcpModeEnabled = true;
  await chrome.storage.local.set({ mcpModeEnabled: true });

  // Start keepalive alarm (every 25 seconds)
  chrome.alarms.create(MCP_KEEPALIVE_ALARM, { periodInMinutes: 25 / 60 });

  // Start inactivity timer
  resetInactivityTimer();

  // Connect to MCP server
  connectToMCP();

  // Update context menu
  updateContextMenu();

  console.log('[MCP] Mode enabled');
}

async function disableMCPMode(): Promise<void> {
  mcpModeEnabled = false;
  await chrome.storage.local.set({ mcpModeEnabled: false });

  // Clear alarms
  chrome.alarms.clear(MCP_KEEPALIVE_ALARM);
  chrome.alarms.clear(MCP_INACTIVITY_ALARM);

  // Disconnect
  disconnectFromMCP();

  // Update badge and menu
  updateMCPBadge(false);
  updateContextMenu();

  console.log('[MCP] Mode disabled');
}

function resetInactivityTimer(): void {
  chrome.alarms.clear(MCP_INACTIVITY_ALARM);
  chrome.alarms.create(MCP_INACTIVITY_ALARM, { delayInMinutes: MCP_INACTIVITY_TIMEOUT_MIN });
}

function updateMCPBadge(connected: boolean): void {
  if (mcpModeEnabled) {
    chrome.action.setBadgeText({ text: connected ? 'MCP' : '...' });
    chrome.action.setBadgeBackgroundColor({ color: connected ? '#22c55e' : '#f59e0b' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function updateContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'toggle-mcp-mode',
      title: mcpModeEnabled ? '✓ Disable MCP mode' : 'Enable MCP mode',
      contexts: ['action'],
    });
  });
}

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MCP_KEEPALIVE_ALARM) {
    // Keepalive: just being here keeps the service worker alive
    // Also check connection status
    if (mcpModeEnabled && (!mcpSocket || mcpSocket.readyState !== WebSocket.OPEN)) {
      connectToMCP();
    }
  } else if (alarm.name === MCP_INACTIVITY_ALARM) {
    console.log('[MCP] Inactivity timeout - disabling MCP mode');
    disableMCPMode();
  }
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'toggle-mcp-mode') {
    if (mcpModeEnabled) {
      disableMCPMode();
    } else {
      enableMCPMode();
    }
  }
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  updateContextMenu();
});

chrome.runtime.onInstalled.addListener(() => {
  updateContextMenu();
});

async function handleMCPCapture(request: MCPCaptureRequest): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendMCPResponse(request.id, false, undefined, 'No active tab');
      return;
    }

    const settings = await getSettings();
    const format = request.format || settings.defaultFormat;
    const quality = request.quality || settings.jpegQuality;

    let path: string | null = null;

    if (request.mode === 'area' && request.area) {
      // Area capture
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
      const croppedDataUrl = await cropImage(dataUrl, request.area);

      let finalDataUrl = croppedDataUrl;
      if (format === 'jpeg' || format === 'webp') {
        finalDataUrl = await convertFormat(croppedDataUrl, format, quality);
      } else if (format === 'gif') {
        finalDataUrl = await convertToGif(croppedDataUrl);
      }

      path = await saveAndGetPath(finalDataUrl, format);
    } else {
      // Visible capture
      const captureFormat = format === 'jpeg' ? 'jpeg' : 'png';
      const dataUrl = await chrome.tabs.captureVisibleTab({
        format: captureFormat,
        quality,
      });

      let finalDataUrl = dataUrl;
      if (format === 'gif') {
        finalDataUrl = await convertToGif(dataUrl);
      } else if (format === 'webp') {
        finalDataUrl = await convertFormat(dataUrl, 'webp', quality);
      }

      path = await saveAndGetPath(finalDataUrl, format);
    }

    if (path) {
      sendMCPResponse(request.id, true, path);
    } else {
      sendMCPResponse(request.id, false, undefined, 'Failed to save screenshot');
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    sendMCPResponse(request.id, false, undefined, error);
  }
}

async function saveAndGetPath(dataUrl: string, format: string): Promise<string | null> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `screenshot-${timestamp}.${format}`;

  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: 'uniquify',
  });

  return getDownloadPath(downloadId);
}

function sendMCPResponse(id: string, success: boolean, path?: string, error?: string): void {
  if (mcpSocket?.readyState === WebSocket.OPEN) {
    mcpSocket.send(JSON.stringify({ id, success, path, error }));
  }
}

// Restore MCP mode state on startup
chrome.storage.local.get(['mcpModeEnabled'], (result) => {
  if (result.mcpModeEnabled) {
    enableMCPMode();
  } else {
    updateContextMenu();
  }
});
