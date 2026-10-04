# ISIZOFIKA: rules for AI agents

## What this project is
ISIZOFIKA is a parcel handover platform. The sender creates an order, takes the
parcel to a taxi rank and hands it to a taxi driver (outside the system). The
driver drops it at a collection store, store staff mark it received, and the
recipient collects it with a PIN.
There is NO driver app and NO driver account. Do not build driver features.

## Stack
- mobile/  React Native with Expo (JavaScript)
- server/  Node.js and Express API
- PostgreSQL in Docker for local development

## Statuses (MVP)
CREATED, READY_FOR_COLLECTION, COLLECTED, CANCELLED, EXPIRED.

## Security rules (non-negotiable)
- The QR code identifies an order. It must NEVER release a parcel.
- The collection PIN releases a parcel. Store only a hash of it. Never log it.
- Enforce every rule on the server, never only in the mobile app.
- Hash passwords. Limit wrong PIN attempts.
- Store staff may only see and act on orders for their own store.
- Never print, commit or copy secrets. Use .env files, which are git-ignored,
  and keep a .env.example with fake values.

## How to work
- One feature at a time. Do only what I ask in this message.
- Before changing anything, list the files you will touch and wait for approval.
- After changing code, tell me exactly how to test it.
- Do not install new packages without asking.
- Never commit or push unless I ask. Never touch the main branch.
- Never run destructive commands such as `docker compose down -v` or delete data folders.

## Environment
Windows 11, PowerShell, VS Code, Docker Desktop.
Project folder: C:\ISIZOFIKA_TAXI_DELIVERY_SYSTEM