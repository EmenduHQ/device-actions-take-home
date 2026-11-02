# Fake MDM: provider documentation

`fake-mdm` stands in for our real MDM provider (a NinjaOne-style RMM). Its endpoints and payloads copy the real ones, simplified. Treat it as an external API you don't control: **don't edit `fake-mdm/`, and don't depend on reading its code.**

Base URL: `http://localhost:4010`

## Auth

`POST /ws/oauth/token` (form-urlencoded)

```
grant_type=client_credentials&client_id=take-home-client&client_secret=take-home-secret
```

→ `200 { access_token, token_type: "Bearer", expires_in: 300 }`. Send `Authorization: Bearer <token>` on every other call. An expired or unknown token gets `401`. `src/mdm/token.ts` already handles this for you.

## Devices

`GET /v2/devices` → an array of devices.
`GET /v2/device/{id}` → one device:

```json
{ "id": 1001, "systemName": "ACME-LT-01", "nodeClass": "WINDOWS_WORKSTATION",
  "organizationId": 7, "offline": false, "lastContact": 1793643413.71 }
```

- `lastContact` is **epoch seconds as a float**.
- `nodeClass` is the provider's own enum (`WINDOWS_WORKSTATION`, `MAC`, …).

## Running an action

The provider has no "reboot" endpoint. You run one of the device's built-in **actions**.

1. `GET /v2/device/{id}/scripting/options` lists what the device can run:

   ```json
   { "scripts": [
       { "type": "ACTION", "uid": "9a8b…", "name": "Reboot (Safe Mode)" },
       { "type": "ACTION", "uid": "6f1c…", "name": "Reboot" },
       { "type": "SCRIPT", "id": 207, "name": "Restart Print Spooler" } ] }
   ```

   Uids depend on the operating system. Look them up per device and don't hard-code them.

2. `POST /v2/device/{id}/script/run` with `{ "type": "ACTION", "uid": "<uid>" }` returns **`204` with no body**.
   - You get no job id back.
   - An offline device gets `409`. A uid the device doesn't offer gets `404`.

### Reliability

Like the real provider, this one is not reliable:
- Sometimes it is slow, taking more than 10 s to answer.
- Sometimes it answers `429` with a `Retry-After` header.
- Sometimes it answers `5xx`.

**An error or a timeout does not tell you whether the action ran on the machine.** Design for that.

## Activity feed: how you find out what happened

`GET /v2/device/{id}/activities?pageSize=20&olderThan=<activityId>&newerThan=<activityId>`

```json
{ "lastActivityId": 880654,
  "activities": [
    { "id": 880652, "activityTime": 1793643420.1, "deviceId": 1001,
      "activityType": "ACTION", "status": "COMPLETED",
      "statusCode": "agent_action_completed", "activityResult": "SUCCESS",
      "sourceConfigUid": "6f1c…", "sourceName": "Reboot", "seriesUid": "…" } ] }
```

- Rows come **newest first**, at most 50 per page. Use `olderThan` to page back and `newerThan` to read only rows after a given id.
- `lastActivityId` is the newest activity id in the **whole account**, not only this device. Ids only go up.
- One action run usually writes these rows. The `ACTION` rows of one run share a `seriesUid`.
  1. `ACTION` / `agent_action_started`
  2. `SYSTEM` / `SYSTEM_REBOOTED`, if the machine restarted
  3. `ACTION` / `agent_action_completed` + `SUCCESS`, or `agent_action_failed` + `FAILURE` with a `message`
- **The feed is shared.** It also holds:
  - older runs
  - policy conditions
  - other actions, such as patch scans
  - users restarting their own machines, which writes a `SYSTEM_REBOOTED` with no action involved
- **The measured success signature** on the real provider is an `ACTION` row with `status: COMPLETED`, `statusCode: agent_action_completed`, `activityResult: SUCCESS` and your action's `sourceConfigUid`, written after you launched it. A `SYSTEM_REBOOTED` row on its own proves nothing.
- Some machines never report back.

## Test helpers (not part of the provider API)

- `GET /__fake/dispatches` lists every action that really ran. Use it to check that you never reboot a machine twice.
- `POST /__fake/reset` restores the initial state.
- Environment variables:
  - `FAKE_MDM_CHAOS=0` turns off errors and slowness while you develop.
  - `FAKE_MDM_SPEED=10` makes every timing 10× faster.
  - `FAKE_MDM_SEED=<n>` makes a run repeatable.

## Seeded devices

| id | name | class | notes |
|---|---|---|---|
| 1001 | ACME-LT-01 | WINDOWS_WORKSTATION | online |
| 1002 | ACME-MB-02 | MAC | online |
| 1003 | ACME-LT-03 | WINDOWS_WORKSTATION | offline for 3 h |
| 1004 | ACME-LT-04 | WINDOWS_WORKSTATION | online |
| 1005 | ACME-MB-05 | MAC | online |
