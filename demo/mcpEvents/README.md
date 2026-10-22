# MCP Events weather demo

This local demo has two cooperating pieces:

- **MCP server**: publishes the `Check weather in any city` tool and a `weather.changed` event. Its tool always returns `it's cold and windy...brrrr!` for the requested city.
- **Listener agent**: discovers the server, subscribes to `weather.changed` for one city, verifies signed webhook deliveries, and prints each update. Press Enter in the terminal and the server sends `OMG! The sun came out` to the subscriber.

The subscriber is a separate MCP Events consumer, so it demonstrates the event loop. It can also ask OpenAI for a one-sentence reaction if `OPENAI_API_KEY` is set. The event delivery itself works without an API key.

## Run the local demo

In PowerShell:

```powershell
cd .\demo\mcpEvents
npm install
npm start
```

When the listener says it subscribed, press **Enter**. Press Enter again to send another update, or type `q` then Enter to stop. By default the listener watches Miami. To change it, set `DEMO_CITY` before starting:

```powershell
$env:DEMO_CITY = "Seattle"
npm start
```

Optional model-generated reaction:

```powershell
$env:OPENAI_API_KEY = "your_api_key"
$env:OPENAI_MODEL = "gpt-6-astra"
npm start
```

The demo listens only on `127.0.0.1`. It persists event IDs/cursors and subscription metadata in `.local-state.json` so a later subscription can replay matching events. The generated webhook signing secret is local demo data; do not commit or share that file.

## What happens when you press Enter

1. The terminal producer creates a unique `weather.changed` event with a city, message, timestamp, and cursor.
2. The MCP server selects active subscriptions whose city filter matches.
3. The server sends the event as a signed webhook, preserving the event ID on retries.
4. The listener verifies the signature and timestamp, then prints the change. A small Responses API call optionally turns the event data into a friendly sentence.

The server implements event discovery (`server/discover`, `events/list`), subscribe/unsubscribe, callback challenge verification, and signed webhook delivery. The local listener uses a loopback callback to keep the demo easy to run. That local callback mode is intentionally for demonstration; it is not a safe ChatGPT Work deployment. The official MCP Events integration requires HTTPS callbacks that are reachable and validated, verified webhook delivery, and persistent subscription handling. Follow the [MCP Events guide](https://developers.openai.com/plugins/build/mcp-events) before exposing an endpoint publicly.

## Connect the weather tool to Codex

Codex can call the weather tool through the included stdio MCP adapter. From this folder, add it to your local Codex configuration:

```powershell
$server = (Resolve-Path .\codex-server.js).Path
codex mcp add weather-demo -- node $server
codex mcp list
```

Start a new Codex chat and ask: **“Check the demo weather in Seattle.”** Codex can call the tool and receive the cold/windy reply.

This config exposes the weather tool only. The documented MCP Events subscription flow is webhook-based and is supported in ChatGPT Work; this demo's local listener shows the event arriving. Codex does not become the listener just because its MCP tool connection is configured. See [MCP Events availability](https://developers.openai.com/plugins/build/mcp-events) and [Codex MCP setup](https://developers.openai.com/learn/docs-mcp) for the supported product details.

To remove the local Codex connection later:

```powershell
codex mcp remove weather-demo
```
