import express from "express";
import OpenAI from "openai";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4173);
const allowedHosts = new Set([
  "deepstation.ai",
  "www.deepstation.ai",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);

let running = false;
let currentSessionId = null;
let history = [];
const clients = new Set();

function publish(type, data = {}) {
  const message = { id: history.length + 1, type, at: new Date().toISOString(), ...data };
  history.push(message);
  if (history.length > 80) history = history.slice(-80);
  for (const response of clients) response.write(`data: ${JSON.stringify(message)}\n\n`);
}

function sendInputText(text) {
  return [{ type: "input_text", text }];
}

async function answerApproval(client, sessionId, approval) {
  const request = approval.request;
  if (request?.type !== "browser_origin_access") {
    publish("notice", { message: `The browser requested unsupported access (${request?.type || "unknown"}); stopping safely.` });
    return false;
  }

  let host = "";
  try {
    host = new URL(request.origin).hostname.toLowerCase();
  } catch {
    // Invalid origins are denied below.
  }
  const decision = allowedHosts.has(host) ? "approve" : "deny";
  publish("approval", {
    origin: request.origin,
    decision,
    message: decision === "approve"
      ? `Allowing the requested demo site: ${request.origin}`
      : `Denied an origin outside the demo allowlist: ${request.origin}`,
  });
  await client.beta.agents.sessions.events.create(sessionId, {
    events: [{
      type: "agent.session.input.computer_use_approval_request_result",
      request_id: approval.request_id,
      response: { type: "browser_origin_access", decision },
    }],
  });
  return decision === "approve";
}

async function runDemo() {
  if (running) return;
  if (!process.env.OPENAI_API_KEY) {
    publish("error", { message: "Set OPENAI_API_KEY, then restart this app." });
    return;
  }

  running = true;
  currentSessionId = null;
  publish("status", { state: "starting", message: "Creating the OpenAI-hosted browser session…" });
  const client = new OpenAI();
  let sessionId;
  let completed = false;

  try {
    const session = await client.beta.agents.sessions.create({
      agent: {
        model: process.env.OPENAI_MODEL || "gpt-6-astra",
        instructions: "Use the visible browser UI only. Open https://deepstation.ai/. Wait briefly for the page to settle. Find and click the blue Follow Us button on the right side of the page. Pause so the user can see the transition. On the page that opens, find and click the YouTube button/link. Wait for the destination to load, then stop. Do not sign in, subscribe, post, or change account/site data. If the page differs from the expected layout, describe what you see and stop rather than guessing.",
        tools: [{ type: "computer_use", include_screenshots: true }],
      },
      environment: {
        type: "openai_hosted",
        desktop: { enabled: true },
        network: { access: "enabled" },
      },
    });
    sessionId = session.id;
    currentSessionId = session.id;
    publish("session", { sessionId: session.id, message: "Browser session ready." });

    const stream = await client.beta.agents.sessions.events.stream(session.id);
    await client.beta.agents.sessions.events.create(session.id, {
      events: [{
        type: "agent.session.input.message",
        input: [{ role: "user", content: sendInputText("Open https://deepstation.ai/ and complete the requested Follow Us → YouTube browser demo. Move deliberately and pause briefly between the two clicks so the screenshots show each step.") }],
      }],
    });

    const handledApprovals = new Set();
    for await (const event of stream) {
      if (event.type === "agent.session.requires_action") {
        const current = await client.beta.agents.sessions.retrieve(session.id);
        for (const approval of current.required_actions || []) {
          if (approval.type !== "computer_use_approval_request" || handledApprovals.has(approval.request_id)) continue;
          handledApprovals.add(approval.request_id);
          const approved = await answerApproval(client, session.id, approval);
          if (!approved) throw new Error("Browser access was denied or could not be approved.");
        }
      } else if (event.type === "agent.session.turn.item.done") {
        const item = event.item;
        if (item?.type === "computer_use_call") {
          publish("activity", {
            title: item.title || "Browser activity",
            status: item.status || "completed",
          });
          const output = item.output;
          if (output?.type === "computer_screenshot" && output.image_url?.startsWith("data:image/")) {
            publish("screenshot", { imageUrl: output.image_url });
          }
        }
      } else if (event.type === "agent.session.turn.output_text.done") {
        publish("agent_message", { message: event.text });
      } else if (event.type === "agent.session.turn.completed") {
        if (!event.turn?.subagent_id) {
          completed = true;
          break;
        }
      } else if (["agent.session.turn.failed", "agent.session.turn.cancelled"].includes(event.type)) {
        if (!event.turn?.subagent_id) throw new Error(`Agent turn ${event.type.replace("agent.session.turn.", "")}.`);
      } else if (["error", "agent.session.failed", "agent.session.environment.failed"].includes(event.type)) {
        throw new Error(event.error?.message || `Browser session failed (${event.type}).`);
      }
    }

    if (!completed) throw new Error("The browser event stream ended before the task completed.");
    publish("status", { state: "completed", message: "The browser task finished." });
  } catch (error) {
    publish("error", { message: error?.message || String(error) });
  } finally {
    if (sessionId) {
      try {
        await client.beta.agents.sessions.delete(sessionId);
      } catch (error) {
        publish("notice", { message: `Could not delete session ${sessionId}: ${error.message}` });
      }
    }
    currentSessionId = null;
    running = false;
  }
}

app.use(express.static(path.join(__dirname, "public")));
app.get("/api/events", (request, response) => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  clients.add(response);
  for (const event of history) response.write(`data: ${JSON.stringify(event)}\n\n`);
  request.on("close", () => clients.delete(response));
});
app.get("/api/status", (_request, response) => response.json({ running, sessionId: currentSessionId }));
app.post("/api/run", (_request, response) => {
  if (!running) void runDemo();
  response.json({ accepted: true, running });
});

app.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Agents API Computer Use demo: ${url}`);
  console.log("Opening the local screenshot viewer; the hosted-browser demonstration starts when it loads.");
  const browser = process.platform === "win32"
    ? ["cmd.exe", ["/c", "start", "", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  execFile(browser[0], browser[1], { windowsHide: true }, (error) => {
    if (error) console.log(`Open ${url} in a browser to start the demo.`);
  });
});
