const BASE_URL = "https://api.openweathermap.org";

// ── AQI label lookup table ────────────────────────────────────
const AQI_LABELS = {
  1: { label: "Good",      color: "#00e400", advice: "Air quality is great. Enjoy outdoor activities!" },
  2: { label: "Fair",      color: "#ffff00", advice: "Air quality is acceptable." },
  3: { label: "Moderate",  color: "#ff7e00", advice: "Sensitive groups should limit prolonged outdoor exertion." },
  4: { label: "Poor",      color: "#ff0000", advice: "Everyone may begin to experience health effects." },
  5: { label: "Very Poor", color: "#630101", advice: "Health alert — everyone should avoid outdoor activity." },
};

export default async function handler(req, res) {

  // ── CORS + method guard ───────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Validate input ────────────────────────────────────────
  const { city } = req.query;

  if (!city || city.trim() === "") {
    return res.status(400).json({
      error: "Missing required parameter: city",
      example: "/api/airquality?city=Victoria"
    });
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfiguration: missing API key" });
  }

  try {
    // ── Step 1: Geocode city → coordinates ───────────────────
    const geoUrl = `${BASE_URL}/geo/1.0/direct?q=${encodeURIComponent(city.trim())}&limit=1&appid=${apiKey}`;
    const geoResponse = await fetch(geoUrl);
    const geoData = await geoResponse.json();

    if (!geoData || geoData.length === 0) {
      return res.status(404).json({
        error: `City not found: "${city}"`,
        suggestion: "Check the spelling or try a nearby larger city"
      });
    }

    const { lat, lon, name: officialName, country, state } = geoData[0];

    // ── Step 2: Fetch air quality data ────────────────────────
    const aqiUrl = `${BASE_URL}/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
    const aqiResponse = await fetch(aqiUrl);

    if (!aqiResponse.ok) {
        throw new Error(`OpenWeatherMap error: ${aqiResponse.status}`);
    }

    const aqiData = await aqiResponse.json();


    // The response nests data under list[0]
    const { main, components } = aqiData.list[0];
    const aqiValue = main.aqi; // integer 1-5

    // Look up the human-readable label for this AQI value
    const aqiInfo = AQI_LABELS[aqiValue];

    // ── Step 3: Shape and return the response ─────────────────
    return res.status(200).json({
        location: {
            city: officialName,
            state: state || null,
            country,
            coordinates: { lat, lon },
        },
        air_quality: {
            aqi: aqiValue,                  // raw number 1-5
            label: aqiInfo.label,           // "Good", "Fair", etc.
            color: aqiInfo.color,           // hex color for UI
            advice: aqiInfo.advice,         // human-readable recommendation
        },
        pollutants: {
            // Carbon monoxide
            co:   components.co,
            // Nitrogen monoxide & dioxide
            no:   components.no,
            no2:  components.no2,
            // Ozone
            o3:   components.o3,
            // Sulphur dioxide
            so2:  components.so2,
            // Fine particulte matter (most commonly referenced)
            pm2_5: components.pm2_5,
            pm10:  components.pm10,
            // Ammonia
            nh3:  components.nh3,
        },
        meta: {
            fetched_at: new Date().toISOString(),
            source: "OpenWeatherMap"
        }
    });

  } catch (error) {
    console.error("Air quality API error:", error.message);
    return res.status(500).json({
      error: "Failed to fetch air quality data",
      message: error.message
    });
  }
}