export const weatherTool = {
  name: "check_weather_in_any_city",
  title: "Check weather in any city",
  description: "Use this when someone asks for the demo weather in a city. It always returns the same intentionally playful forecast.",
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string", description: "City to check, for example Miami or Seattle." },
    },
    required: ["city"],
    additionalProperties: false,
  },
};

export function checkWeather(city) {
  const normalizedCity = String(city || "").trim();
  if (!normalizedCity) throw new Error("Please provide a city name.");
  return `Weather in ${normalizedCity}: it's cold and windy...brrrr!`;
}

export const weatherEvent = {
  name: "weather.changed",
  description: "The demo weather changes for a subscribed city.",
  delivery: ["webhook"],
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string", description: "City to monitor for demo weather changes." },
    },
    required: ["city"],
    additionalProperties: false,
  },
  payloadSchema: {
    type: "object",
    properties: {
      city: { type: "string" },
      message: { type: "string" },
    },
    required: ["city", "message"],
    additionalProperties: false,
  },
};
