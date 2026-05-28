import type { ChatSessionModelFunctions } from "node-llama-cpp";

const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};

interface GeoResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface IpLocation {
  status: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
}

interface WeatherResult {
  location: string;
  temperature: string;
  feels_like: string;
  humidity: string;
  wind_speed: string;
  condition: string;
  local_time: string;
}

async function resolveLocation(city: string): Promise<{ lat: number; lon: number; label: string }> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  const data = await res.json() as { results?: GeoResult[] };
  if (!data.results?.length) throw new Error(`Location not found: ${city}`);
  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, label: `${r.name}, ${r.country}` };
}

async function resolveCurrentLocation(): Promise<{ lat: number; lon: number; label: string }> {
  const res = await fetch("http://ip-api.com/json");
  const data = await res.json() as IpLocation;
  if (data.status !== "success") throw new Error("Could not detect current location.");
  return { lat: data.lat, lon: data.lon, label: `${data.city}, ${data.country}` };
}

async function fetchWeather(lat: number, lon: number, label: string): Promise<WeatherResult> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&timezone=auto`;

  const res = await fetch(url);
  const data = await res.json() as {
    current: {
      time: string;
      temperature_2m: number;
      apparent_temperature: number;
      relative_humidity_2m: number;
      wind_speed_10m: number;
      weather_code: number;
    };
  };

  const c = data.current;
  return {
    location: label,
    temperature: `${c.temperature_2m}°C`,
    feels_like: `${c.apparent_temperature}°C`,
    humidity: `${c.relative_humidity_2m}%`,
    wind_speed: `${c.wind_speed_10m} km/h`,
    condition: WMO_CODES[c.weather_code] ?? "Unknown",
    local_time: c.time,
  };
}

export const weatherTools = {
  getWeather: {
    description:
      "Get the current weather conditions for a location. " +
      "If the user does not specify a location, automatically detect their current location.",
    params: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City or place name, e.g. 'Paris', 'New York', 'Tokyo'. Omit to use current location.",
        },
      },
    } as const,
    async handler({ location }: { location?: string }): Promise<WeatherResult> {
      const resolved = location
        ? await resolveLocation(location)
        : await resolveCurrentLocation();
      return fetchWeather(resolved.lat, resolved.lon, resolved.label);
    },
  },
} satisfies ChatSessionModelFunctions;
