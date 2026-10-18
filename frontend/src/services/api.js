const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/+$/, "");

async function request(path, { token, ...options } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Unable to connect to the backend. Check that your server is running.",
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

// Authentication
export function signup({ name, email, password }) {
  return request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function login({ email, password }) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function loginWithGoogle(credential) {
  return request("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export function getProfile(token) {
  return request("/api/auth/me", { token });
}

// Extract a city from a weather question.
function extractCity(message) {
  const text = message.trim();

  const timeWords =
    /\b(today|tomorrow|tonight|now|currently|right now|this week|next week|this morning|this afternoon|this evening|in the morning|in the afternoon|in the evening|after\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:minutes?|hours?|days?)|in\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:minutes?|hours?|days?))\b/gi;

  const cleanedMessage = text
    .replace(timeWords, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\b(?:weather|temperature|forecast|rain|raining|humidity|wind|snow|sunny|cloudy|conditions)\s+(?:in|for|at)\s+([a-zA-Z][a-zA-Z\s-]{0,60}?)(?=\s+[?!.,]|[?!.,]|$)/i,
    /\b(?:in|for)\s+([a-zA-Z][a-zA-Z\s-]{0,60}?)\s+(?:weather|forecast|temperature)\b/i,
  ];

  for (const pattern of patterns) {
    const match = cleanedMessage.match(pattern);

    if (match) {
      const city = match[1].trim().replace(/\s+/g, " ");

      if (
        !/^(today|tomorrow|tonight|now|currently|right now|this week|next week)$/i.test(
          city,
        )
      ) {
        return city;
      }
    }
  }

  return null;
}

export function sendChatMessage({ token, message, conversationId }) {
  const storageKey = conversationId
    ? `btp_city_${conversationId}`
    : "btp_current_city";

  const rememberedCity = localStorage.getItem(storageKey);

  return request("/api/chat", {
    method: "POST",
    token,
    body: JSON.stringify({
      message,
      ...(rememberedCity ? { previousCity: rememberedCity } : {}),
      ...(conversationId ? { conversationId } : {}),
    }),
  }).then((result) => {
    if (result.conversationId && result.weather?.city) {
      localStorage.setItem(
        `btp_city_${result.conversationId}`,
        result.weather.city,
      );
    }

    return result;
  });
}

// Conversation history
export function getConversations(token) {
  return request("/api/chat/conversations", { token });
}

export function getConversation(token, conversationId) {
  return request(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
    { token },
  );
}

// Contact
export function sendContactMessage({ name, email, subject, message }) {
  return request("/api/contact", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      subject,
      message,
    }),
  });
}

// OpenWeather city suggestions (API key is kept on the backend).
export function searchProCities(query, token) {
  return request(
    `/api/pro/dashboard/locations/search?q=${encodeURIComponent(query)}`,
    { token },
  );
}

// Pro Dashboard
export function getProDashboard(token) {
  return request("/api/pro/dashboard", { token });
}

export function saveProLocation(
  token,
  { city, label = "Home", country = null },
) {
  return request("/api/pro/dashboard/locations", {
    method: "POST",
    token,
    body: JSON.stringify({ city, label, country }),
  });
}

export function deleteProLocation(token, locationId) {
  return request(
    `/api/pro/dashboard/locations/${encodeURIComponent(locationId)}`,
    {
      method: "DELETE",
      token,
    },
  );
}
