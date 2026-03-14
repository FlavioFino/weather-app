
// OpenWeatherMap API base URL — we reference this in all 3 files
const BASE_URL = "https://api.openweathermap.org";

// Every Vercel serverless function exports a default async function
export default async function handler(req, res) {

  // ── CORS headers ──────────────────────────────────────────
  // This allows our frontend (and anyone else) to call this API
  // from a browser. Without this, browsers block the request.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  // Browsers send a "preflight" OPTIONS request before the real one
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ── Only allow GET requests ───────────────────────────────
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Extract & validate query parameter ───────────────────
  const { city } = req.query;

  if (!city || city.trim() === "") {
    return res.status(400).json({
        error: "Missing required parameter: city",
        example: "/api/weather?city=Victoria"
    });
  }

  // ── Grab API key from environment variables ───────────────
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
        error: "Server misconfiguration: missing API key"
    });
  }
  

  try {
    // ── Step 1: Geocode the city name → coordinates ─────────
    const geoUrl = `${BASE_URL}/geo/1.0/direct?q=${encodeURIComponent(city.trim())}&limit=1&appid=${apiKey}`;
    const geoResponse = await fetch(geoUrl);
    const geoData = await geoResponse.json();

    // If the city wasn't found, geoData will be an empty array
    if (!geoData || geoData.length === 0) {
        return res.status(404).json({
            error: `City not found: "${city}"`,
            suggestion: "Check the spelling or try a nearby larger city"
        });
    }

    // Pull out what we need from the geocoding result
    const { lat, lon, name: officialName, country, state } = geoData[0];

    // ── Step 2: Fetch current weather using coordinates ──────
    const weatherUrl = `${BASE_URL}/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) {
        throw new Error(`OpenWeatherMap error: ${weatherResponse.status}`);
    }

    const weatherData = await weatherResponse.json();

    // ── Step 3: Shape our response ───────────────────────────
    const response = {
      // Location info
      location: {
        city: officialName,
        state: state || null,
        country,
        coordinates: { lat, lon },
      },

      // Current conditions
      current: {
        temp_c: Math.round(weatherData.main.temp),
        feels_like_c: Math.round(weatherData.main.feels_like),
        temp_min_c: Math.round(weatherData.main.temp_min),
        temp_max_c: Math.round(weatherData.main.temp_max),
        humidity_percent: weatherData.main.humidity,
        pressure_hpa: weatherData.main.pressure,
      },

      // Sky / conditions
      conditions: {
        description: weatherData.weather[0].description,  // e.g. "light rain"
        main: weatherData.weather[0].main,                // e.g. "Rain" — useful for dynamic backgrounds later
        icon_code: weatherData.weather[0].icon,           // e.g. "10d" — OpenWeatherMap icon code
        icon_url: `https://openweathermap.org/img/wn/${weatherData.weather[0].icon}@2x.png`,
      },

      // Wind
      wind: {
        speed_ms: weatherData.wind.speed,
        speed_kph: Math.round(weatherData.wind.speed * 3.6),
        direction_deg: weatherData.wind.deg,
        gust_ms: weatherData.wind.gust || null,
      },

      // Visibility & clouds
      atmosphere: {
        visibility_km: weatherData.visibility ? weatherData.visibility / 1000 : null,
        cloudiness_percent: weatherData.clouds.all,
      },

      // Sunrise/sunset (Unix timestamps → readable strings)
      sun: {
        sunrise: new Date(weatherData.sys.sunrise * 1000).toISOString(),
        sunset: new Date(weatherData.sys.sunset * 1000).toISOString(),
      },

      // Metadata
      meta: {
        fetched_at: new Date().toISOString(),
        source: "OpenWeatherMap"
      }
    };

    // Send it! 200 = success
    return res.status(200).json(response);

  } catch (error) {
    // ── Global error handler ─────────────────────────────────
    // If anything unexpected goes wrong, we catch it here and
    // return a clean error instead of crashing the function.
    console.error("Weather API error:", error.message);
    return res.status(500).json({
      error: "Failed to fetch weather data",
      message: error.message
    });
  }
}