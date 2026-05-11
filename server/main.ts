import { createServer } from "node:http";
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
const port = parsePort(process.env.MULTIPLAYER_PORT) ?? 8787;
const wsPath = process.env.MULTIPLAYER_WS_PATH ?? "/ws";

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
