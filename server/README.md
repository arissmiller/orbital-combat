# Multiplayer Server Scaffold

This directory contains a minimal authoritative server scaffold for browser multiplayer.

## Current capabilities

- Accepts WebSocket clients on `/ws`
- Generates lobby room codes and creates rooms on-demand (up to 4 active rooms)
- Broadcasts joinable room directory updates for lobby browsing (`room-list`)
- Supports create/join/leave/ready/start-match flow
- Runs an authoritative simulation at 20 Hz on `Caldera Twin-Moon Arena`
- Simulates a gas giant with two moons using different orbital eccentricities
- Broadcasts room state and simulation snapshots
- Can serve built frontend assets from the same process/port (`dist/`)

## Not implemented yet

- Persistence
- Matchmaking services
- Authentication
- Security hardening / anti-cheat

## Protocol shape (high level)

Client messages:

- `hello`
- `create-room`
- `join-room`
- `leave-room`
- `ready`
- `start-match`
- `input`
- `ping`
- `list-rooms`

Server messages:

- `welcome`
- `room-update`
- `room-list`
- `match-started`
- `snapshot`
- `pong`
- `info`
- `error`

See `server/protocol.ts` for authoritative TypeScript contracts.

## Railway notes

- Server listens on `MULTIPLAYER_PORT` first, then falls back to `PORT`.
- Recommended build command: `npm run build:deploy`
- Recommended start command: `npm start`
