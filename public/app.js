// ─────────────────────────────────────────────────────────────
// Frontend logic for the WECS Weather App.
// ─────────────────────────────────────────────────────────────

// ── API base URL ──────────────────────────────────────────────
const API_BASE = window.location.hostname === "localhost"
  ? "http://localhost:3000"
  : "";  // empty string = same domain, works on Vercel automatically

// ── Grab DOM elements we'll interact with ─────────────────────
const cityInput   = document.getElementById("city-input");
const searchBtn   = document.getElementById("search-btn");
const errorMsg    = document.getElementById("error-msg");
const loading     = document.getElementById("loading");
const results     = document.getElementById("results");

// ── Event listeners ───────────────────────────────────────────
// Two ways to trigger a search: clicking the button or pressing Enter
searchBtn.addEventListener("click", handleSearch);

cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});

// ── Main search handler ───────────────────────────────────────
async function handleSearch() {
  const city = cityInput.value.trim();

  // Don't run if the input is empty
  if (!city) {
    showError("Please enter a city name.");
    return;
  }

  // Reset UI state before fetching
  clearError();
  showLoading(true);
  hideResults();

  try {
    // ── Fetch all three endpoints in parallel ─────────────────
    const [weatherData, forecastData, aqiData] = await Promise.all([
      fetchJSON(`${API_BASE}/api/weather?city=${encodeURIComponent(city)}`),
      fetchJSON(`${API_BASE}/api/forecast?city=${encodeURIComponent(city)}`),
      fetchJSON(`${API_BASE}/api/airquality?city=${encodeURIComponent(city)}`),
    ]);

    // Render each section
    renderCurrentWeather(weatherData);
    renderAirQuality(aqiData);
    renderForecast(forecastData);

    // Show the results section
    showLoading(false);
    showResults();

  } catch (err) {
    showLoading(false);
    showError(err.message || "Something went wrong. Please try again.");
  }
}

// ── fetchJSON helper ──────────────────────────────────────────
// Wraps fetch() with error handling so we get clean error
// messages from our API instead of generic network errors.
async function fetchJSON(url) {
  const response = await fetch(url);
  const data = await response.json();

  // If our API returned an error status, throw with its message
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

// ── Render: current weather ───────────────────────────────────
function renderCurrentWeather(data) {
  const { location, current, conditions, wind, atmosphere, sun } = data;

  // Location
  document.getElementById("city-name").textContent = location.city;
  document.getElementById("city-country").textContent =
    location.state ? `${location.state}, ${location.country}` : location.country;

  // Icon
  const icon = document.getElementById("weather-icon");
  icon.src = conditions.icon_url;
  icon.alt = conditions.description;

  // Temperature & description
  document.getElementById("current-temp").textContent = `${current.temp_c}°C`;
  document.getElementById("current-desc").textContent = conditions.description;

  // Detail pills
  document.getElementById("feels-like").textContent  = `${current.feels_like_c}°C`;
  document.getElementById("humidity").textContent    = `${current.humidity_percent}%`;
  document.getElementById("wind").textContent        = `${wind.speed_kph} km/h`;
  document.getElementById("visibility").textContent  =
    atmosphere.visibility_km ? `${atmosphere.visibility_km} km` : "N/A";

  // Sunrise/sunset — convert ISO string to local time
  document.getElementById("sunrise").textContent = formatTime(sun.sunrise);
  document.getElementById("sunset").textContent  = formatTime(sun.sunset);
}

// ── Render: air quality ───────────────────────────────────────
function renderAirQuality(data) {
  const { air_quality } = data;

  const label = document.getElementById("aqi-label");
  label.textContent = `${air_quality.label} (${air_quality.aqi}/5)`;
  // Apply the color our API sent back directly to the element
  label.style.color = air_quality.color;
  label.style.border = `1px solid ${air_quality.color}`;

  document.getElementById("aqi-advice").textContent = air_quality.advice;
}

// ── Render: 5-day forecast ────────────────────────────────────
function renderForecast(data) {
  const strip = document.getElementById("forecast-strip");
  // Clear any previous forecast before rendering new one
  strip.innerHTML = "";

  // Skip today (index 0) — we already show it in current weather
  // Show the next 5 days
  const days = data.forecast.slice(1, 6);

  days.forEach(day => {
    // Build a forecast card for each day using a template string
    // This is injected as HTML — fine here since we control the data source
    const card = document.createElement("div");
    card.className = "forecast-day";
    card.innerHTML = `
      <span class="forecast-day-name">${day.day_of_week.slice(0, 3)}</span>
      <img class="forecast-icon" src="${day.condition.icon_url}" alt="${day.condition.description}" />
      <span class="forecast-high">${day.temp_high_c}°</span>
      <span class="forecast-low">${day.temp_low_c}°</span>
    `;
    strip.appendChild(card);
  });
}

// ── UI state helpers ──────────────────────────────────────────
function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove("hidden");
}

function clearError() {
  errorMsg.textContent = "";
  errorMsg.classList.add("hidden");
}

function showLoading(show) {
  loading.classList.toggle("hidden", !show);
}

function showResults() {
  results.classList.remove("hidden");
}

function hideResults() {
  results.classList.add("hidden");
}

// ── Utility: format ISO timestamp → "7:23 AM" ─────────────────
function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}