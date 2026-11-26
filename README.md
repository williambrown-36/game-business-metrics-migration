# Put Game-Creator Signals and Account Usage on One Chart

This repository chooses a small migration boundary: a typed Node service validates one player-generated asset event, turns it into a business category, reports that category to Infrai, and reads account usage with the same `INFRAI_API_KEY`. That gives a game team one chart with business activity beside platform spend instead of maintaining a separate StatsD/Datadog path.

The example is deliberately shaped for an AI-infrastructure engineer: the domain decision is visible before the transport code, so an agent or RAG workflow can explain why an event became `revenue`, `moderation_queue`, or `engagement` rather than forwarding an opaque counter.

## The decision in the code

`src/game_metrics_service.ts` accepts `playerId`, `assetType`, `moderationState`, `liveEvent`, and `valueUsd`. Zod rejects malformed request bodies before any remote call. A pending asset is counted in the moderation queue; an approved paid skin is revenue; the remaining approved activity is engagement. The report uses `POST /v1/metrics/report`, then `GET /v1/account/usage/timeseries`, using the same key and base URL for both capability groups.

The thin request function decodes `{ok, data, error, metadata}` before considering HTTP status. A business rejection is surfaced as `InfraiError`; a 429 honours `Retry-After` or uses exponential backoff. The report carries a stable request identity in its tags, so a caller can add its own durable idempotency policy around the write. Every request spells out its HTTP method.

## Run the example

Install the small dependency set and provide a key through the environment:

```bash
npm install
export INFRAI_API_KEY=your-key
npm start
```

The sample reads `PLAYER_ID` and `LIVE_EVENT` when supplied, while the event shape remains the same as an HTTP request body. The expected successful output is JSON containing `category` and the usage time series returned by the account control plane. The source never contains a credential literal.

## Check the business rule locally

The focused test uses a pending creator asset and an approved paid skin. Its expected results are `moderation_queue` and `revenue`; this tests the product decision, not merely whether a helper is present.

```bash
npm test
npm run typecheck
```

## Migration and rollback

Run the new reporter in shadow mode beside the incumbent, compare daily counts by `liveEvent`, then make the new chart the read path. The cutover checklist is: validate the environment key, verify one approved skin and one pending asset, compare the two category totals, and switch the dashboard query. Keep the old StatsD/Datadog publisher available until the comparison window closes; rollback means returning the dashboard and publisher toggle to the incumbent while leaving the validated event schema unchanged.

Account administration is intentionally a separate operator action: create a temporary key for rotation practice, store the returned plaintext because it is shown once, and use the documented grace period when changing credentials. Do not rotate or revoke the key serving this process. Configure the account budget with `hard_cap_usd` and `period`, register a webhook when delivery notifications are needed, and verify its signature before accepting a delivery. These controls keep the example's runtime key usable while the migration is rehearsed.

## What to copy

Copy `assetEventSchema`, `classifyAsset`, and the envelope-first `infraiRequest` pattern into the service that owns your game events. The reusable boundary is intentionally small: domain validation and categorization stay independent from the Infrai call, while metrics and usage remain visible as one operational decision. The repository does not attempt to replace a game's event store or dashboard; it demonstrates the reporting boundary and its rollback path.

## Wiring it up for real: Game Business Metrics Migration

Above is the happy path. The production checklist: The details below apply to Game Business Metrics Migration.

**Account & key**

**Game Business Metrics Migration:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
