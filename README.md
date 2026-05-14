# Orbital Combat Web

Browser build of Orbital Combat using Vite + React + PixiJS.
play it over at arissmiller.github.io/orbital-combat

Note: Still in very early development! Most features are not fully implemented yet.

## Multiplayer Server (Scaffold)

A lightweight authoritative multiplayer scaffold now lives in `server/`.

- Transport: WebSockets (`ws`)
- Runtime: Node.js
- Rooms: in-memory only (no persistence yet)
- Tick loop: fixed 20 Hz

### Run in development

```bash
npm run server:dev
```

Defaults:

- HTTP host: `0.0.0.0`
- HTTP port: `8787`
- WebSocket path: `/ws`
- Health check: `GET /healthz`

### Build and run

```bash
npm run server:build
npm run server:start
```

### Deploy to Railway production from GitHub

This repo includes a GitHub Actions workflow at `.github/workflows/railway-production.yml`.

It deploys on pushes to `main` (and can also be run manually from the Actions tab).

1. In GitHub, go to `Settings -> Secrets and variables -> Actions`.
2. Add repository secret `RAILWAY_TOKEN`.
3. Create that token in Railway as a **project token scoped to the `production` environment**.

Workflow target details:

- Project ID: `f2871c98-bb92-4c08-937e-5bd516709cdb`
- Environment: `production`
- Service: `orbital-combat-web-prod`

### Optional env vars

- `MULTIPLAYER_HOST`
- `MULTIPLAYER_PORT`
- `MULTIPLAYER_WS_PATH`

## Browser Multiplayer Menu (Prototype)

The in-game Multiplayer menu now connects to the WebSocket server scaffold.

- Set `VITE_MULTIPLAYER_WS_URL` to override the default client URL.
- Default client URL is `ws://<current-host>:8787/ws` (or `wss://` on HTTPS).
- From the Multiplayer menu you can connect, create/join rooms, ready/unready, start match (host), leave, and ping.
