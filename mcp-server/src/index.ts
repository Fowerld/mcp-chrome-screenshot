#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";

const WS_PORT = 9876;

type CaptureMode = "visible" | "area";
type CaptureFormat = "png" | "jpeg" | "webp" | "gif";

interface CaptureRequest {
  id: string;
  mode: CaptureMode;
  format: CaptureFormat;
  area?: { x: number; y: number; width: number; height: number };
  quality?: number;
}

interface CaptureResponse {
  id: string;
  success: boolean;
  path?: string;
  error?: string;
}

class ExtensionBridge {
  private wss: WebSocketServer;
  private client: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (response: CaptureResponse) => void;
    reject: (error: Error) => void;
  }>();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws) => {
      console.error(`[MCP] Extension connected`);
      this.client = ws;

      ws.on("message", (data) => {
        try {
          const response = JSON.parse(data.toString()) as CaptureResponse;
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            pending.resolve(response);
            this.pendingRequests.delete(response.id);
          }
        } catch (e) {
          console.error("[MCP] Failed to parse message:", e);
        }
      });

      ws.on("close", () => {
        console.error("[MCP] Extension disconnected");
        this.client = null;
      });
    });

    console.error(`[MCP] WebSocket server listening on port ${port}`);
  }

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  async capture(request: Omit<CaptureRequest, "id">): Promise<CaptureResponse> {
    if (!this.isConnected()) {
      return {
        id: "",
        success: false,
        error: "Extension not connected. Make sure Quick Screenshot is running in Chrome.",
      };
    }

    const id = crypto.randomUUID();
    const fullRequest: CaptureRequest = { id, ...request };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({
          id,
          success: false,
          error: "Capture timeout - no response from extension",
        });
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.client!.send(JSON.stringify({ type: "capture", ...fullRequest }));
    });
  }
}

async function main() {
  const bridge = new ExtensionBridge(WS_PORT);

  const server = new McpServer({
    name: "quick-screenshot",
    version: "0.1.0",
  });

  server.tool(
    "capture",
    "Capture a screenshot of the current browser tab",
    {
      mode: z.enum(["visible", "area"]).default("visible").describe(
        "Capture mode: 'visible' for viewport, 'area' for a specific region"
      ),
      format: z.enum(["png", "jpeg", "webp", "gif"]).default("png").describe(
        "Output format"
      ),
      area: z.object({
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
        width: z.number().describe("Width in pixels"),
        height: z.number().describe("Height in pixels"),
      }).optional().describe("Area to capture (only for mode='area')"),
      quality: z.number().min(1).max(100).optional().describe(
        "Quality for JPEG/WebP (1-100)"
      ),
    },
    async ({ mode, format, area, quality }) => {
      const response = await bridge.capture({ mode, format, area, quality });

      if (response.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Screenshot saved to: ${response.path}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: `Capture failed: ${response.error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "status",
    "Check if the Quick Screenshot extension is connected",
    {},
    async () => {
      const connected = bridge.isConnected();
      return {
        content: [
          {
            type: "text" as const,
            text: connected
              ? "Quick Screenshot extension is connected and ready."
              : "Quick Screenshot extension is not connected. Open Chrome with the extension installed.",
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Server started");
}

main().catch(console.error);
