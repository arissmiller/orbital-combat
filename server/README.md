# Multiplayer Server Scaffold

This directory contains a minimal authoritative server scaffold for browser multiplayer.

## Current capabilities

- Accepts WebSocket clients on `/ws`
- Generates lobby room codes
- Supports create/join/leave/ready/start-match flow
- Runs a placeholder authoritative simulation at 20 Hz
- Broadcasts room state and simulation snapshots

## Not implemented yet

- Persistence
- Matchmaking services
- Authentication
- Real combat/orbital simulation parity with client runtime
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

Server messages:

- `welcome`
- `room-update`
- `match-started`
- `snapshot`
- `pong`
- `info`
- `error`

See `server/protocol.ts` for authoritative TypeScript contracts.
