import { randomUUID } from "node:crypto";
import { Webhook } from "standardwebhooks";

export function createSignedHeaders(secret, webhookId, body) {
  const signedAt = new Date();
  const signer = new Webhook(secret);
  return {
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": String(Math.floor(signedAt.getTime() / 1000)),
    "webhook-signature": signer.sign(webhookId, signedAt, body),
  };
}

export async function postSignedWebhook({ url, secret, payload, subscriptionId }) {
  const body = JSON.stringify(payload);
  const webhookId = payload.eventId || `msg_${randomUUID()}`;
  const headers = createSignedHeaders(secret, webhookId, body);
  if (subscriptionId) headers["X-MCP-Subscription-Id"] = subscriptionId;
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
    headers,
    body,
  });
  return response;
}
