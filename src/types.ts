// Capture modes
export type CaptureMode = 'visible' | 'area' | 'fullpage';

// Image formats
export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp';

// Extension state
export interface ExtensionState {
  lastMode: CaptureMode;
  isCapturing: boolean;
  previewActive: boolean;
}

// User settings
export interface Settings {
  defaultFormat: ImageFormat;
  jpegQuality: number; // 0-100
  downloadFolder: string; // relative to Downloads
  filenamePattern: string; // e.g., "screenshot-{timestamp}"
  copyPathToClipboard: boolean;
}

// Messages between background and content scripts
export type Message =
  | { type: 'START_PREVIEW'; mode: CaptureMode }
  | { type: 'CANCEL_PREVIEW' }
  | { type: 'CAPTURE_NOW' }
  | { type: 'AREA_SELECTED'; rect: SelectionRect; format?: ImageFormat }
  | { type: 'PREVIEW_READY' }
  | { type: 'CAPTURE_COMPLETE'; path: string }
  | { type: 'MODE_CHANGED'; mode: CaptureMode }
  | { type: 'PREVIEW_CANCELLED' }
  | { type: 'CAPTURE_VISIBLE'; format?: ImageFormat };

// Selection rectangle for area capture
export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Download result
export interface DownloadResult {
  success: boolean;
  path: string;
  filename: string;
  error?: string;
}
