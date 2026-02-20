// Guard against multiple injections
if ((window as any).__qs_injected) {
  throw new Error('Already injected');
}
(window as any).__qs_injected = true;

// Types (inline to avoid ES module exports)
type CaptureMode = 'visible' | 'area' | 'fullpage';
interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Message {
  type: string;
  mode?: CaptureMode;
  path?: string;
  rect?: SelectionRect;
}

// Types
type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp';

// State
let previewActive = false;
let currentMode: CaptureMode = 'visible';
let currentFormat: ImageFormat = 'png';
let overlay: HTMLDivElement | null = null;
let selectionBox: HTMLDivElement | null = null;
let isSelecting = false;
let startX = 0;
let startY = 0;
let lastAreaRect: SelectionRect | null = null;
let hasPreselectedArea = false;

// Listen for messages from background
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_PREVIEW':
      if (message.mode) {
        showPreview(message.mode);
      }
      break;
    case 'CANCEL_PREVIEW':
      hidePreview();
      break;
    case 'CAPTURE_COMPLETE':
      if (message.path) {
        showNotification(message.path);
      }
      hidePreview();
      break;
  }
  return true;
});

// Listen for keyboard events
document.addEventListener('keydown', (e) => {
  if (!previewActive) {
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    hidePreview();
    // Notify background that preview was cancelled
    chrome.runtime.sendMessage({ type: 'PREVIEW_CANCELLED' });
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    cycleMode(e.key === 'ArrowRight' ? 1 : -1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentMode === 'area' && hasPreselectedArea && lastAreaRect) {
      // Hide overlay BEFORE capture so it doesn't appear in screenshot
      const rectToCapture = { ...lastAreaRect };
      const format = currentFormat;
      hidePreview();
      // Small delay to ensure DOM is updated before capture
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'AREA_SELECTED',
          rect: rectToCapture,
          format,
        });
      }, 100);
    } else if (currentMode === 'visible') {
      // Capture visible tab
      const format = currentFormat;
      hidePreview();
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE', format });
      }, 100);
    }
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    cycleFormat();
  }
});

// Cycle through capture modes
function cycleMode(direction: number = 1): void {
  const modes: CaptureMode[] = ['visible', 'area'];
  const currentIndex = modes.indexOf(currentMode);
  const nextIndex = (currentIndex + direction + modes.length) % modes.length;
  const nextMode = modes[nextIndex];

  // Remove current overlay and show new one
  hidePreview();
  showPreview(nextMode);

  // Notify background of mode change
  chrome.runtime.sendMessage({ type: 'MODE_CHANGED', mode: nextMode });
}

// Cycle through formats
function cycleFormat(): void {
  const formats: ImageFormat[] = ['png', 'jpeg', 'webp', 'gif'];
  const currentIndex = formats.indexOf(currentFormat);
  const nextIndex = (currentIndex + 1) % formats.length;
  currentFormat = formats[nextIndex];

  // Update format indicator
  updateFormatIndicator();
}

// Update format badge in overlay
function updateFormatIndicator(): void {
  let badge = overlay?.querySelector('.qs-format-badge') as HTMLElement;
  if (!badge && overlay) {
    badge = document.createElement('div');
    badge.className = 'qs-format-badge';
    overlay.appendChild(badge);
  }
  if (badge) {
    badge.textContent = currentFormat.toUpperCase();
  }
}

// Show preview overlay
function showPreview(mode: CaptureMode): void {
  previewActive = true;
  currentMode = mode;

  createOverlay();

  if (mode === 'area') {
    enableAreaSelection();
  } else {
    showVisiblePreview();
  }
}

// Hide preview overlay
function hidePreview(): void {
  previewActive = false;
  isSelecting = false;

  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  if (selectionBox) {
    selectionBox.remove();
    selectionBox = null;
  }
}

// Create base overlay
function createOverlay(): void {
  overlay = document.createElement('div');
  overlay.id = 'qs-overlay';
  overlay.innerHTML = `
    <style>
      #qs-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 2147483647;
        pointer-events: none;
      }
      #qs-overlay.interactive {
        pointer-events: auto;
        cursor: crosshair;
      }
      #qs-overlay .qs-border {
        position: absolute;
        background: rgba(59, 130, 246, 0.5);
      }
      #qs-overlay .qs-border-top,
      #qs-overlay .qs-border-bottom {
        left: 0;
        right: 0;
        height: 3px;
      }
      #qs-overlay .qs-border-left,
      #qs-overlay .qs-border-right {
        top: 0;
        bottom: 0;
        width: 3px;
      }
      #qs-overlay .qs-border-top { top: 0; }
      #qs-overlay .qs-border-bottom { bottom: 0; }
      #qs-overlay .qs-border-left { left: 0; }
      #qs-overlay .qs-border-right { right: 0; }
      #qs-overlay .qs-mode-indicator {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }
      #qs-overlay .qs-mode-icon {
        width: 20px;
        height: 20px;
      }
      #qs-selection-box {
        position: fixed;
        border: 2px solid #3b82f6;
        background: rgba(59, 130, 246, 0.1);
        z-index: 2147483647;
        pointer-events: none;
        display: none;
      }
      #qs-notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(34, 197, 94, 0.95);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        z-index: 2147483647;
        animation: qs-slide-in 0.3s ease, qs-fade-out 0.3s ease 2.7s;
        max-width: 400px;
        word-break: break-all;
      }
      .qs-format-badge {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(59, 130, 246, 0.95);
        color: white;
        padding: 6px 12px;
        border-radius: 6px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 600;
        pointer-events: none;
      }
      @keyframes qs-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes qs-fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    </style>
  `;
  document.body.appendChild(overlay);
}

// Show visible tab preview (border highlight)
function showVisiblePreview(): void {
  if (!overlay) {
    return;
  }

  overlay.innerHTML += `
    <div class="qs-border qs-border-top"></div>
    <div class="qs-border qs-border-bottom"></div>
    <div class="qs-border qs-border-left"></div>
    <div class="qs-border qs-border-right"></div>
    <div class="qs-mode-indicator">
      <svg class="qs-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
      </svg>
      Visible Tab • Enter to capture • ←→ mode • F format • Esc cancel
    </div>
  `;
  updateFormatIndicator();
}

// Enable area selection mode
async function enableAreaSelection(): Promise<void> {
  if (!overlay) {
    return;
  }

  overlay.classList.add('interactive');

  // Create selection box
  selectionBox = document.createElement('div');
  selectionBox.id = 'qs-selection-box';
  document.body.appendChild(selectionBox);

  // Load last area rect
  const storage = await chrome.storage.local.get('lastAreaRect');
  lastAreaRect = storage.lastAreaRect || null;
  hasPreselectedArea = false;

  if (lastAreaRect) {
    // Show preselected area
    hasPreselectedArea = true;
    selectionBox.style.display = 'block';
    selectionBox.style.left = `${lastAreaRect.x}px`;
    selectionBox.style.top = `${lastAreaRect.y}px`;
    selectionBox.style.width = `${lastAreaRect.width}px`;
    selectionBox.style.height = `${lastAreaRect.height}px`;

    overlay.innerHTML += `
      <div class="qs-mode-indicator">
        <svg class="qs-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
        </svg>
        Select Area • Enter capture • Click reselect • ←→ mode • F format • Esc
      </div>
    `;
  } else {
    overlay.innerHTML += `
      <div class="qs-mode-indicator">
        <svg class="qs-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
        </svg>
        Select Area • Click and drag • ←→ mode • F format • Esc
      </div>
    `;
  }

  // Mouse events
  overlay.addEventListener('mousedown', handleMouseDown);
  overlay.addEventListener('mousemove', handleMouseMove);
  overlay.addEventListener('mouseup', handleMouseUp);

  updateFormatIndicator();
}

function handleMouseDown(e: MouseEvent): void {
  isSelecting = true;
  hasPreselectedArea = false; // User is making a new selection
  startX = e.clientX;
  startY = e.clientY;

  if (selectionBox) {
    selectionBox.style.display = 'block';
    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = '0';
    selectionBox.style.height = '0';
  }
}

function handleMouseMove(e: MouseEvent): void {
  if (!isSelecting || !selectionBox) {
    return;
  }

  const width = Math.abs(e.clientX - startX);
  const height = Math.abs(e.clientY - startY);
  const left = Math.min(e.clientX, startX);
  const top = Math.min(e.clientY, startY);

  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
}

function handleMouseUp(e: MouseEvent): void {
  if (!isSelecting) {
    return;
  }

  isSelecting = false;

  const rect: SelectionRect = {
    x: Math.min(startX, e.clientX),
    y: Math.min(startY, e.clientY),
    width: Math.abs(e.clientX - startX),
    height: Math.abs(e.clientY - startY),
  };

  // Minimum selection size
  if (rect.width < 10 || rect.height < 10) {
    return; // Keep overlay, user can try again
  }

  // Store as current selection, wait for Enter to confirm
  lastAreaRect = rect;
  hasPreselectedArea = true;

  // Update indicator to show Enter to capture
  const indicator = overlay?.querySelector('.qs-mode-indicator');
  if (indicator) {
    indicator.innerHTML = `
      <svg class="qs-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
      </svg>
      Press Enter to capture • Click to reselect • Esc to cancel
    `;
  }
}

// Show notification with path
function showNotification(path: string): void {
  const notification = document.createElement('div');
  notification.id = 'qs-notification';
  notification.textContent = `Screenshot saved! Path copied: ${path}`;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}
