# Emendu take-home: device actions

Thanks for taking the time. Everything you need is on this page. You don't need to email anyone to get started.

## Context

Emendu manages laptops for companies. To act on a machine remotely (restart it, run a script, wipe it), we go through an external MDM provider. That provider is slow, sometimes fails, and doesn't always tell you whether an action worked. We might also switch providers one day.

## Your mission

Build the backend module that lets us **order a reboot on a device and know how it ended**.

## What you get

- This repo:
  - TypeScript, strict mode, with `make verify` running lint (`no-explicit-any`), typecheck and tests
  - Postgres 16 and the fake provider in `docker-compose.yml`
  - `src/mdm/token.ts`, a ready-made OAuth token helper
- **Any TypeScript/Node framework is fine:** NestJS, Fastify, Express, Hono… Add what you need. We don't score framework idioms.
- `fake-mdm`, our stand-in for the real provider. **Read [`FAKE_MDM.md`](FAKE_MDM.md) first.**
- No real credentials. Everything runs locally.

```bash
cp .env.example .env
docker compose up -d   # Postgres on :5432, fake MDM on :4010
npm install
make verify
```

## Requirements (core)

1. **`POST /api/v1/devices/:deviceId/actions`**, with body `{ "type": "REBOOT" }` and an `Idempotency-Key` header.
   - Store the action **before** calling the provider. Answer `202 { actionId, status }`.
   - Same key and same body: return the same action. The machine must never be rebooted twice.
   - Same key with a different body: answer `422`.
2. If the device is offline (`offline: true`, or `lastContact` more than 5 minutes old), answer `202` with `status: "REJECTED"` and send nothing.
3. **States:** `PENDING → SENT → EXECUTED | FAILED | UNVERIFIED`, plus `REJECTED`. Every transition is guarded: an invalid transition must never be written.
4. **A background verifier** settles each sent action from the provider's activity feed, using the success and failure signatures in `FAKE_MDM.md`.
   - Activity that came before your dispatch, belongs to another device or belongs to another action must never count.
   - With no answer after **2 minutes**, the action becomes `UNVERIFIED`.
5. **`GET /api/v1/actions/:id`** returns the state, ISO-8601 timestamps and the history of transitions.
   - Our API must **not** expose the provider's names, ids or fields.
   - Your domain should not depend on the provider or on the framework. Switching providers should only touch the adapter.
6. **Tests** for the state logic and the idempotency, against an in-memory fake adapter (not the container).

**Extras** (optional; they only break ties):
- safe with two verifier instances
- backoff that respects `Retry-After`
- `409` when a reboot is already in flight for that device

## Time

The exercise is designed for **about 3 hours**. You have **5 days** from when you receive it, so pick the moment that suits you. If you don't get to everything, prioritise and explain your choices. That counts too.

## AI

Use it as you would at work. We assess whether you understand every line and can defend it. In the next session you'll extend your own code live.

## Deliver

**Keep your work private.** Don't fork this repo: forks of a public repo are public.

1. Click **Use this template → Create a new repository → Private**.
2. Commit as you go. Your history helps us.
3. Fill in [`DECISIONS.md`](DECISIONS.md), one page at most.
4. Before the deadline, add **`dealmengor`** as a collaborator (Settings → Collaborators) and reply to the email you received with the repo link.

Before you send it:
- `docker compose up` and `make verify` pass on a clean clone.
- There are no secrets in the repo.

We reply within **3 working days** of your delivery.

## What happens next

If we move forward, the next step is a **90-minute session at our office in Valencia**. We'll:
- talk through your `DECISIONS.md`
- extend your code together
- read a few logs
- point your adapter at a **real MDM sandbox** and reboot a real test laptop with your code

Bring your laptop with the repo running.
