import readline from "node:readline";
import { createWeatherEventsServer } from "./http-mcp-server.js";
import { startListenerAgent } from "./listener-agent.js";

const city = process.env.DEMO_CITY || "Miami";
const server = createWeatherEventsServer({ city });
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
let listener;
let stopping = false;

console.log("\nMCP Events · local weather demo");
console.log(`Watching: ${city}`);
console.log("Press Enter to publish weather.changed. Type q then Enter to quit.\n");

await server.ready;
listener = await startListenerAgent({ city });

terminal.on("line", async (line) => {
  if (line.trim().toLowerCase() === "q") {
    if (stopping) return;
    stopping = true;
    terminal.close();
    await listener?.stop();
    await server.close();
    process.exit(0);
  }
  if (stopping) return;
  try {
    await server.emitWeatherChange(city);
    console.log("\nPress Enter to publish another change, or q then Enter to quit.");
  } catch (error) {
    console.error(`[MCP server] ${error.message}`);
  }
});

process.on("SIGINT", async () => {
  if (stopping) return;
  stopping = true;
  terminal.close();
  await listener?.stop();
  await server.close();
  process.exit(0);
});
