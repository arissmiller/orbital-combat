import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { RoomManager } from "./room-manager.js";
import {
  SERVER_TICK_RATE,
  parseClientMessage,
  safeJsonParse,
  type ServerMessage,
} from "./protocol.js";

const host = process.env.MULTIPLAYER_HOST ?? "0.0.0.0";
const port =
  parsePort(process.env.MULTIPLAYER_PORT)
  ?? parsePort(process.env.PORT)
  ?? 8787;
const wsPath = process.env.MULTIPLAYER_WS_PATH ?? "/ws";
const serveFrontend = parseBooleanEnv(process.env.MULTIPLAYER_SERVE_FRONTEND, true);
const frontendDistDir = resolve(
  process.cwd(),
  process.env.MULTIPLAYER_FRONTEND_DIST ?? "dist",
);
const frontendIndexPath = join(frontendDistDir, "index.html");
const frontendAvailable = serveFrontend && existsSync(frontendIndexPath);

const roomManager = new RoomManager();

const httpServer = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({
      ok: true,
      service: "orbital-combat-multiplayer-server",
      uptimeSeconds: Math.round(process.uptime()),
      nowMs: Date.now(),
    }));
    return;
  }

  if (frontendAvailable && (request.method === "GET" || request.method === "HEAD")) {
    const served = tryServeFrontendAsset(request.url, response, request.method === "HEAD");
    if (served) {
      return;
    }
  }

  response.writeHead(404, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify({
    ok: false,
    error: "not-found",
  }));
});

const wsServer = new WebSocketServer({
  server: httpServer,
  path: wsPath,
});
wsServer.on("error", (error) => {
  console.error("[ws-server-error]", error);
});

wsServer.on("connection", (socket, request) => {
  const client = roomManager.registerClient(socket);
  send(socket, {
    type: "welcome",
    playerId: client.id,
    serverTimeMs: Date.now(),
  });

  console.log(`[connect] ${client.id} ${request.socket.remoteAddress ?? "unknown-ip"}`);

  socket.on("message", (rawData) => {
    const text = RoomManager.decodePayload(rawData);
    if (!text) {
      send(socket, {
        type: "error",
        code: "bad-payload",
        message: "Only UTF-8 text messages are supported.",
      });
      return;
    }

    const parsed = safeJsonParse(text);
    const message = parseClientMessage(parsed);
    if (!message) {
      send(socket, {
        type: "error",
        code: "bad-message",
        message: "Invalid client message format.",
      });
      return;
    }

    roomManager.handleMessage(client.id, message);
  });

  socket.on("close", () => {
    console.log(`[disconnect] ${client.id}`);
    roomManager.unregisterClient(client.id);
  });

  socket.on("error", (error) => {
    console.warn(`[socket-error] ${client.id}`, error);
  });
});

const tickHandle = setInterval(() => {
  roomManager.tick();
}, Math.round(1000 / SERVER_TICK_RATE));

httpServer.on("error", (error) => {
  console.error("[http-server-error]", error);
});

httpServer.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`);
  console.log(`[server] websocket path ${wsPath}`);
  console.log(`[server] tick rate ${SERVER_TICK_RATE} Hz`);
  if (serveFrontend) {
    if (frontendAvailable) {
      console.log(`[server] serving frontend from ${frontendDistDir}`);
    } else {
      console.log(
        `[server] frontend not found at ${frontendDistDir}. Run "npm run build" to enable same-process hosting.`,
      );
    }
  }
});

function shutdown(signal: string): void {
  console.log(`[server] received ${signal}; shutting down.`);
  clearInterval(tickHandle);
  wsServer.close();
  httpServer.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 4000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

function parsePort(rawPort: string | undefined): number | null {
  if (!rawPort) {
    return null;
  }
  const parsed = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return null;
  }
  return parsed;
}

function parseBooleanEnv(rawValue: string | undefined, fallback: boolean): boolean {
  if (!rawValue) {
    return fallback;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return fallback;
}

function tryServeFrontendAsset(
  rawUrl: string | undefined,
  response: ServerResponse,
  headOnly: boolean,
): boolean {
  const pathname = parsePathname(rawUrl);
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalizedPath.includes("..")) {
    return false;
  }

  const assetPath = join(frontendDistDir, normalizedPath);
  const hasExtension = extname(normalizedPath).length > 0;
  const fallbackToIndex = !hasExtension;
  const resolvedPath = pickAssetPath(assetPath, fallbackToIndex);
  if (!resolvedPath) {
    return false;
  }

  const contentType = detectContentType(resolvedPath);
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": contentType === "text/html; charset=utf-8"
      ? "no-store"
      : "public, max-age=3600",
  });

  if (headOnly) {
    response.end();
    return true;
  }

  const stream = createReadStream(resolvedPath);
  stream.on("error", () => {
    response.writeHead(500, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({
      ok: false,
      error: "asset-read-failed",
    }));
  });
  stream.pipe(response);
  return true;
}

function parsePathname(rawUrl: string | undefined): string {
  try {
    const url = new URL(rawUrl ?? "/", "http://localhost");
    return decodeURIComponent(url.pathname);
  } catch {
    return "/";
  }
}

function pickAssetPath(assetPath: string, fallbackToIndex: boolean): string | null {
  if (isFile(assetPath)) {
    return assetPath;
  }
  if (fallbackToIndex && isFile(frontendIndexPath)) {
    return frontendIndexPath;
  }
  return null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function detectContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}
