const state = document.querySelector("#state");
const screen = document.querySelector("#screen");
const url = document.querySelector("#url");
const activity = document.querySelector("#activity");
const count = document.querySelector("#activity-count");
const messages = document.querySelector("#messages");
let activityCount = 0;
let started = false;

function setState(label, kind = "working") {
  state.className = `state ${kind}`;
  state.querySelector("span").textContent = label;
}

function addMessage(message, kind = "") {
  const item = document.createElement("p");
  item.className = kind;
  item.textContent = message;
  messages.prepend(item);
  while (messages.children.length > 5) messages.lastElementChild.remove();
}

function addActivity(title, status) {
  activity.querySelector(".empty")?.remove();
  const item = document.createElement("li");
  const label = document.createElement("span");
  const badge = document.createElement("small");
  label.textContent = title;
  badge.textContent = status || "completed";
  item.append(label, badge);
  activity.append(item);
  activityCount += 1;
  count.textContent = String(activityCount).padStart(2, "0");
  while (activity.children.length > 12) activity.firstElementChild.remove();
}

function handleEvent(event) {
  switch (event.type) {
    case "status":
      setState(event.state === "completed" ? "Completed" : "Working", event.state);
      addMessage(event.message);
      break;
    case "session":
      url.textContent = `Hosted browser · ${event.sessionId}`;
      break;
    case "activity":
      addActivity(event.title, event.status);
      break;
    case "screenshot": {
      screen.replaceChildren();
      const image = document.createElement("img");
      image.src = event.imageUrl;
      image.alt = "Latest screenshot from the Agents API computer use session";
      screen.append(image);
      url.textContent = "Latest screenshot · OpenAI-hosted browser";
      break;
    }
    case "approval":
    case "notice":
      addMessage(event.message, event.decision === "deny" ? "error" : "");
      break;
    case "agent_message":
      addMessage(event.message, "agent-message");
      break;
    case "error":
      setState("Needs attention", "error");
      screen.innerHTML = `<div class="screen-placeholder error-card"><strong>Demo stopped</strong><p></p><small>Check the terminal for setup details.</small></div>`;
      screen.querySelector("p").textContent = event.message;
      addMessage(event.message, "error");
      break;
  }
}

const stream = new EventSource("/api/events");
stream.onmessage = (message) => {
  try { handleEvent(JSON.parse(message.data)); } catch { /* Ignore malformed event data. */ }
};
stream.onerror = () => setState("Reconnecting", "error");

async function run() {
  activity.replaceChildren();
  activityCount = 0;
  count.textContent = "00";
  messages.replaceChildren();
  screen.innerHTML = '<div class="screen-placeholder"><div class="spinner"></div><p>Starting the hosted browser…</p><small>It can take a few moments to open the first screenshot.</small></div>';
  url.textContent = "Waiting for browser session";
  setState("Starting", "working");
  await fetch("/api/run", { method: "POST" });
}

document.querySelector("#restart").addEventListener("click", run);

// The app is designed to start the requested browser tour as soon as it opens.
if (!started) {
  started = true;
  run();
}
