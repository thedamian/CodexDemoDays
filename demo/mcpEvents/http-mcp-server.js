import express from "express";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postSignedWebhook } from "./event-delivery.js";
import { checkWeather, weatherEvent, weatherTool } from "./weather.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(__dirname, ".local-state.json");
const callbackForDemo = "http://127.0.0.1:4101/mcp-events/callback";

function loadState() {
  try {
    if (existsSync(statePath)) return JSON.parse(readFileSync(statePath, "utf8"));
  } catch (error) {
    console.warn(`Could not read local event state: ${error.message}`);
  }
  return { subscriptions: [], events: [], sequence: 0 };
}

function saveState(state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

export function createWeatherEventsServer({ port = Number(process.env.MCP_PORT || 4100), listenerPort = Number(process.env.LISTENER_PORT || 4101), city = "Miami", onLine = console.log } = {}) {
  const state = loadState();
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  const callbackForDemo = `http://127.0.0.1:${listenerPort}/mcp-events/callback`;

  async function deliver(subscription, event) {
    const { sequence: _sequence, ...eventPayload } = event;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await postSignedWebhook({
          url: subscription.url,
          secret: subscription.secret,
          subscriptionId: subscription.id,
          payload: eventPayload,
        });
        if (response.ok) {
          subscription.cursor = event.cursor;
          saveState(state);
          onLine(`[MCP server] Delivered ${event.eventId} to ${subscription.url}`);
          return true;
        }
        lastError = new Error(`Listener returned HTTP ${response.status}`);
        if ([410, 413].includes(response.status)) break;
      } catch (error) {
        lastError = error;
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
    onLine(`[MCP server] Delivery failed: ${lastError?.message || "unknown error"}`);
    return false;
  }

  async function verifyCallback(url, secret, subscriptionId) {
    const challenge = randomUUID();
    const response = await postSignedWebhook({
      url,
      secret,
      subscriptionId,
      payload: { type: "verification", challenge },
    });
    if (!response.ok) throw new Error(`Callback verification returned HTTP ${response.status}.`);
    const reply = await response.json();
    if (reply.challenge !== challenge) throw new Error("Callback verification challenge did not match.");
  }

  async function subscribe(params) {
    if (params.name !== weatherEvent.name) throw new Error("Unknown event name.");
    const cityFilter = String(params.arguments?.city || "").trim();
    if (!cityFilter) throw new Error("The city filter is required.");
    if (params.delivery?.mode !== "webhook") throw new Error("This demo supports webhook delivery only.");
    if (params.delivery.url !== callbackForDemo) throw new Error("The local demo accepts only its built-in listener callback.");
    const secret = String(params.delivery.secret || "");
    if (!/^whsec_[A-Za-z0-9+/=]+$/.test(secret)) throw new Error("A whsec_ signing secret is required.");
    const secretBytes = Buffer.from(secret.slice(6), "base64").length;
    if (secretBytes < 24 || secretBytes > 64) throw new Error("Signing secret must decode to 24–64 bytes.");

    const identity = createHash("sha256").update(canonical({
      url: params.delivery.url,
      name: params.name,
      arguments: params.arguments,
    })).digest("hex");
    const subscriptionId = `sub_${identity.slice(0, 20)}`;
    await verifyCallback(params.delivery.url, secret, subscriptionId);
    let subscription = state.subscriptions.find((item) => item.identity === identity);
    if (!subscription) {
      subscription = { id: subscriptionId, identity, name: params.name, arguments: { city: cityFilter }, url: params.delivery.url };
      state.subscriptions.push(subscription);
    }
    subscription.url = params.delivery.url;
    subscription.secret = secret;
    subscription.active = true;
    subscription.refreshBefore = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const cursor = Number.isFinite(Number(params.cursor)) ? Number(params.cursor) : state.sequence;
    const oldestRetainedSequence = state.events[0]?.sequence ?? state.sequence + 1;
    const truncated = cursor < oldestRetainedSequence - 1;
    const missed = state.events.filter((event) => event.sequence > cursor && event.data.city.toLocaleLowerCase() === cityFilter.toLocaleLowerCase());
    saveState(state);
    for (const event of missed) await deliver(subscription, event);
    return { id: subscription.id, refreshBefore: subscription.refreshBefore, cursor: String(state.sequence), truncated };
  }

  async function handleRpc(request) {
    const id = request.id ?? null;
    const params = request.params || {};
    try {
      switch (request.method) {
        case "initialize":
          return rpcResult(id, {
            protocolVersion: params.protocolVersion || "2025-11-25",
            capabilities: { tools: {} },
            serverInfo: { name: "weather-mcp-events-demo", version: "1.0.0" },
            instructions: "Demo weather tool plus the weather.changed event. The event endpoint is local-demo-only.",
          });
        case "notifications/initialized":
          return null;
        case "ping":
          return rpcResult(id, {});
        case "server/discover":
          return rpcResult(id, {
            resultType: "complete",
            supportedVersions: ["2026-07-28"],
            capabilities: { tools: {}, events: {} },
          });
        case "tools/list":
          return rpcResult(id, { tools: [weatherTool] });
        case "tools/call": {
          if (params.name !== weatherTool.name) throw new Error("Unknown tool.");
          const text = checkWeather(params.arguments?.city);
          return rpcResult(id, { content: [{ type: "text", text }], isError: false });
        }
        case "events/list":
          return rpcResult(id, { events: [weatherEvent] });
        case "events/subscribe":
          return rpcResult(id, await subscribe(params));
        case "events/unsubscribe": {
          const existing = state.subscriptions.find((item) => item.name === params.name
            && item.url === params.delivery?.url
            && canonical(item.arguments) === canonical(params.arguments));
          if (existing) existing.active = false;
          saveState(state);
          return rpcResult(id, {});
        }
        default:
          return rpcError(id, -32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      return rpcError(id, -32602, error.message || "Invalid request.");
    }
  }

  app.post("/mcp", async (request, response) => {
    const message = request.body;
    if (Array.isArray(message)) {
      const replies = [];
      for (const item of message) {
        const reply = await handleRpc(item);
        if (reply) replies.push(reply);
      }
      return response.status(replies.length ? 200 : 202).json(replies);
    }
    const reply = await handleRpc(message);
    if (!reply) return response.status(202).end();
    return response.json(reply);
  });
  app.get("/health", (_request, response) => response.json({ ok: true, name: "weather-mcp-events-demo" }));

  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const server = app.listen(port, "127.0.0.1", () => {
    onLine(`[MCP server] Listening at http://127.0.0.1:${port}/mcp`);
    resolveReady();
  });

  async function emitWeatherChange(targetCity = city) {
    const normalizedCity = String(targetCity).trim();
    if (!normalizedCity) throw new Error("Choose a city before triggering the event.");
    state.sequence += 1;
    const event = {
      eventId: `evt_${String(state.sequence).padStart(6, "0")}_${randomUUID().slice(0, 8)}`,
      name: weatherEvent.name,
      timestamp: new Date().toISOString(),
      data: { city: normalizedCity, message: "OMG! The sun came out" },
      cursor: String(state.sequence),
      sequence: state.sequence,
    };
    state.events.push(event);
    if (state.events.length > 200) state.events = state.events.slice(-200);
    saveState(state);
    onLine(`[MCP server] Weather changed for ${normalizedCity}; sending ${event.eventId}`);
    const targets = state.subscriptions.filter((subscription) => subscription.active
      && subscription.name === event.name
      && subscription.arguments.city.toLocaleLowerCase() === normalizedCity.toLocaleLowerCase());
    if (!targets.length) onLine("[MCP server] No active subscription matches that city.");
    for (const subscription of targets) await deliver(subscription, event);
    return event;
  }

  return {
    callbackForDemo,
    emitWeatherChange,
    ready,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
