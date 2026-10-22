# Agents API Computer Use demo

A small local web app that starts an OpenAI Agents API session in an OpenAI-hosted browser. The page shows the session's browser activity and screenshots while the agent opens DeepStation, clicks **Follow Us**, then opens its YouTube link.

The hosted browser runs remotely; the screenshot viewer in this app is how you watch it. The agent is instructed to pause between the clicks and to stop after YouTube opens.

## Requirements

- Node.js 20 or newer
- An OpenAI API key with access to the Agents API and computer use
- Network access to OpenAI and the websites used by the demo

## Run it

In PowerShell:

```powershell
cd .\demo\AgentsAPIComputerUse
npm install
$env:OPENAI_API_KEY = "your_api_key"
npm start
```

The app opens `http://127.0.0.1:4173` in your default browser. The demo starts when the page loads. Select **Run again** to repeat it. The app keeps the API key in the terminal environment; it is never sent to the browser page. If the browser does not open automatically, open the printed address manually.

Optional settings:

```powershell
$env:OPENAI_MODEL = "gpt-6-astra"
$env:PORT = "4173"
```

The app only approves browser-origin requests for DeepStation and YouTube. It denies other origins and does not sign in or interact with account controls. The Agents API can emit a computer-use screenshot in each completed browser activity item when `include_screenshots` is enabled; this app displays those streamed images and the activity title/status.

## What the demo shows

1. The local viewer opens.
2. The Agents API creates an OpenAI-hosted browser session.
3. The agent opens `https://deepstation.ai/`, pauses, clicks **Follow Us**, pauses, and clicks the YouTube link.
4. Browser activity and screenshots appear in the viewer until the session completes.

See the official [Computer use guide](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) for the session and computer-use API details.
