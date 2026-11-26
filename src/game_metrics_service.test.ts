import assert from "node:assert/strict";
import test from "node:test";
import { classifyAsset } from "./game_metrics_service.ts";

test("pending player assets become the moderation queue metric", () => {
  const category = classifyAsset({
    playerId: "p-17",
    assetType: "item",
    moderationState: "pending",
    liveEvent: "creator-jam",
    valueUsd: 0
  });
  assert.equal(category, "moderation_queue");
});

test("approved paid skins become revenue", () => {
  assert.equal(classifyAsset({
    playerId: "p-18",
    assetType: "skin",
    moderationState: "approved",
    liveEvent: "creator-jam",
    valueUsd: 4
  }), "revenue");
});
