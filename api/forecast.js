const BASE_URL = "https://api.openweathermap.org";

export default async function handler(req, res) {

  // ── CORS + method guard ───────────────────────────────────
  // Same boilerplate as weather.js — every endpoint needs this
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
      example: "/api/forecast?city=Victoria"
    });
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfiguration: missing API key" });
  }

  try {
    // ── Step 1: Geocode city → coordinates ───────────────────
    // Identical to weather.js — we always geocode first
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

    // ── Step 2: Fetch 5-day / 3-hour forecast ────────────────
    // This returns 40 entries: one per 3-hour block over 5 days
    const forecastUrl = `${BASE_URL}/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    const forecastResponse = await fetch(forecastUrl);

    if (!forecastResponse.ok) {
      throw new Error(`OpenWeatherMap error: ${forecastResponse.status}`);
    }

    const forecastData = await forecastResponse.json();

    // ── Step 3: Group 3-hour snapshots into daily summaries ──
    const dailyMap = {};

    forecastData.list.forEach(snapshot => {
        // "2026-03-14 09:00:00" → "2026-03-14"
        const date = snapshot.dt_txt.split(" ")[0];

        if (!dailyMap[date]) {
            dailyMap[date] = [];
        }
        dailyMap[date].push(snapshot);
    });

    // ── Step 4: Summarize each day ────────────────────────────
    const days = Object.entries(dailyMap).map(([date, snapshots]) => {

      // Collect all temps to find daily high/low
      const temps = snapshots.map(s => s.main.temp);
      const humidity = snapshots.map(s => s.main.humidity);

      // Find the most common weather condition across all snapshots
      const conditionCount = {};
      snapshots.forEach(s => {
        const condition = s.weather[0].main; // e.g. "Rain", "Clouds", "Clear"
        conditionCount[condition] = (conditionCount[condition] || 0) + 1;
      });

      // Pick whichever condition appeared most often
      const dominantCondition = Object.entries(conditionCount)
        .sort((a, b) => b[1] - a[1])[0][0];

      // Find a snapshot that matches the dominant condition for
      // its icon — prefer midday snapshots (more representative)
      const representativeSnapshot = snapshots.find(
        s => s.weather[0].main === dominantCondition
      );

      return {
        date,                           // "2026-03-15"
        day_of_week: new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }),
        temp_high_c: Math.round(Math.max(...temps)),
        temp_low_c: Math.round(Math.min(...temps)),
        avg_humidity_percent: Math.round(
          humidity.reduce((sum, h) => sum + h, 0) / humidity.length
        ),
        condition: {
          main: dominantCondition,
          description: representativeSnapshot.weather[0].description,
          icon_code: representativeSnapshot.weather[0].icon,
          icon_url: `https://openweathermap.org/img/wn/${representativeSnapshot.weather[0].icon}@2x.png`,
        },
        // Rain/snow volume if present (not always in the response)
        precipitation_mm: snapshots.reduce((sum, s) => {
          return sum + (s.rain?.["3h"] || s.snow?.["3h"] || 0);
        }, 0).toFixed(1),
        // snapshot_count tells us how many 3hr blocks we had for this day
        // (today and day 5 may have fewer than 8)
        snapshot_count: snapshots.length,
      };
    });

    // ── Step 5: Shape and return the response ─────────────────
    return res.status(200).json({
        location: {
            city: officialName,
            state: state || null,
            country,
            coordinates: { lat, lon },
        },
        forecast: days,    // array of up to 6 days
        meta: {
            fetched_at: new Date().toISOString(),
            source: "OpenWeatherMap",
            note: "First and last day may have fewer than 8 snapshots"
        }
    });

  } catch (error) {
    console.error("Forecast API error:", error.message);
    return res.status(500).json({
      error: "Failed to fetch forecast data",
      message: error.message
    });
  }
}