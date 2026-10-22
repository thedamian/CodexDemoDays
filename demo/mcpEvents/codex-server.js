import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkWeather } from "./weather.js";

const server = new McpServer({ name: "weather-demo", version: "1.0.0" });

server.registerTool(
  "check_weather_in_any_city",
  {
    title: "Check weather in any city",
    description: "Use this when someone asks for the demo weather in a city. It always returns the same intentionally playful forecast.",
    inputSchema: { city: z.string().min(1).describe("City to check, for example Miami or Seattle.") },
  },
  async ({ city }) => ({ content: [{ type: "text", text: checkWeather(city) }] }),
);

await server.connect(new StdioServerTransport());
