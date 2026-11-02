# Emendu take-home: device actions

At Emendu, Claude Code writes much of our code. What we hire for is the person who keeps a codebase **easy to grow and easy to understand, for humans and for agents**. This exercise looks for that.

## The problem

We manage company laptops through an external MDM provider. It is slow, it sometimes fails, and it doesn't always tell you whether an action worked. We may switch providers. `fake-mdm` stands in for it. Read [`FAKE_MDM.md`](FAKE_MDM.md) first.

## Build

**A small feature.** Order a reboot on a device and find out how it ended.

- `POST /api/v1/devices/:deviceId/actions` with `{ "type": "REBOOT" }` and an `Idempotency-Key` header. It answers `202 { actionId, status }`.
  - A device must never be rebooted twice for the same key.
  - The same key with a different body answers `422`.
  - An offline device ends as `REJECTED`, and nothing is sent.
- **States:** `PENDING → SENT → EXECUTED | FAILED | UNVERIFIED`, plus `REJECTED`. An invalid transition is never written.
- A background verifier settles each action from the activity feed. With no answer after 2 minutes, the action becomes `UNVERIFIED`.
- `GET /api/v1/actions/:id` returns the state, ISO-8601 timestamps and the transition history. Nothing from the provider leaks out.

**A repo that can grow.** Imagine that from tomorrow, agents add the next 50 features to it: wipe, lock, install software, other providers.

- **The architecture is visible:** you can tell from the folder tree what the system does and where each piece goes.
- **Its rules are enforced, not just written.** Make the important ones fail `make verify`: layer boundaries, a domain that doesn't depend on the provider or the framework, and "an action is stored before it is sent". Choose your own tools: lint rules, architecture tests, scripts, Claude Code hooks, skills, `CLAUDE.md`/`AGENTS.md`.
- **The flow is traceable.** Model what happens to an action as events, so that a person or an agent can follow who did what and what reacted to it.

Use AI as you would at work. We don't grade how much code you write by hand. We grade the fundamentals and the patterns: what you decided, what you enforced and why.

## Deliver

- **Time:** about 3–4 h, within 5 days.
- **Where:** a **private** repo created with **Use this template**. Don't fork it.
  - Commit as you go.
  - Add `dealmengor` as a collaborator.
  - Reply to the email with the link.
- **What:**
  - `make verify` passes on a clean clone.
  - [`DECISIONS.md`](DECISIONS.md) is filled in, one page at most.

```bash
cp .env.example .env && docker compose up -d && npm install && make verify
```

## Next

The next step is a session in Valencia. In it we'll:
- extend your repo
- break one of your rules on purpose to see whether your guardrails catch it
- point your adapter at a real MDM sandbox and reboot a real laptop
- discuss the open questions in [`QUESTIONS.md`](QUESTIONS.md)
