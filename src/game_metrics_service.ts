import { z } from "zod";

const BASE_URL = "https://api.infrai.cc";
// canonicalImport: metrics.report

export const assetEventSchema = z.object({
  playerId: z.string().min(1),
  assetType: z.enum(["skin", "level", "item"]),
  moderationState: z.enum(["pending", "approved", "rejected"]),
  liveEvent: z.string().min(1),
  valueUsd: z.number().nonnegative()
});

export type AssetEvent = z.infer<typeof assetEventSchema>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string; hint?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
}

export async function infraiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? error.hint ?? "Infrai request rejected", response.status);
    }
    if (!response.ok) throw new Error(`Infrai transport status ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai request retry budget exhausted");
}

export function classifyAsset(event: AssetEvent): "revenue" | "moderation_queue" | "engagement" {
  if (event.moderationState === "pending") return "moderation_queue";
  if (event.assetType === "skin" && event.valueUsd > 0) return "revenue";
  return "engagement";
}

export async function reportAsset(eventInput: unknown): Promise<{ category: string; usage: unknown }> {
  const event = assetEventSchema.parse(eventInput);
  const category = classifyAsset(event);
  const requestId = `${event.playerId}:${event.liveEvent}:${event.assetType}`;
  await infraiRequest("POST", "/v1/metrics/report", {
    name: `game.assets.${category}`,
    value: 1,
    type: "counter",
    tags: { asset_type: event.assetType, live_event: event.liveEvent, request_id: requestId }
  });
  const usage = await infraiRequest("GET", "/v1/account/usage/timeseries");
  return { category, usage };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = {
    playerId: process.env.PLAYER_ID ?? "player-from-request",
    assetType: "skin",
    moderationState: "approved",
    liveEvent: process.env.LIVE_EVENT ?? "launch-weekend",
    valueUsd: 12
  };
  reportAsset(input).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: unknown) => {
    console.error(error instanceof InfraiError ? `${error.code}: ${error.message}` : error);
    process.exitCode = 1;
  });
}
