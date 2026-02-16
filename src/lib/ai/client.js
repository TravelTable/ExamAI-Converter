import { AIProviderError, normalizeAIError } from "./errors";

const COMET_BASE_URL = "https://api.cometapi.com/v1";

function trimTrailingSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

function getRuntimeConfig(getConfig) {
  const cfg = typeof getConfig === "function" ? getConfig() : getConfig;
  const providerMode = cfg?.providerMode || "direct";

  if (providerMode === "proxy") {
    const backendBaseUrl = trimTrailingSlash(cfg?.backendBaseUrl || "");
    const backendAuthToken = (cfg?.backendAuthToken || "").trim();
    if (!backendBaseUrl) {
      throw new AIProviderError({ message: "Proxy mode requires a backend base URL." });
    }
    if (!backendAuthToken) {
      throw new AIProviderError({ message: "Proxy mode requires a backend auth token." });
    }
    return {
      baseUrl: `${backendBaseUrl}/v1`,
      token: backendAuthToken,
      provider: "proxy"
    };
  }

  const cometApiKey = (cfg?.cometApiKey || "").trim();
  if (!cometApiKey) {
    throw new AIProviderError({ message: "Direct mode requires a Comet API key." });
  }

  return {
    baseUrl: COMET_BASE_URL,
    token: cometApiKey,
    provider: "comet"
  };
}

async function requestJSON(getConfig, path, payload = null, method = "POST") {
  const { baseUrl, token, provider } = getRuntimeConfig(getConfig);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new AIProviderError({
      message: errJson?.error?.message || errJson?.message || `AI request failed (${res.status})`,
      status: res.status,
      provider,
      retriable: res.status >= 500 || res.status === 429 || res.status === 408
    });
  }

  return res.json();
}

async function requestBlob(getConfig, path, payload = null) {
  const { baseUrl, token, provider } = getRuntimeConfig(getConfig);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: payload ? JSON.stringify(payload) : undefined
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new AIProviderError({
      message: errJson?.error?.message || errJson?.message || `Audio request failed (${res.status})`,
      status: res.status,
      provider,
      retriable: res.status >= 500 || res.status === 429 || res.status === 408
    });
  }

  return res.blob();
}

export function createAIClient(getConfig) {
  return {
    async chatCompletions(payload) {
      try {
        return await requestJSON(getConfig, "/chat/completions", payload, "POST");
      } catch (err) {
        throw normalizeAIError(err, "Chat request failed");
      }
    },

    async responses(payload) {
      try {
        return await requestJSON(getConfig, "/responses", payload, "POST");
      } catch (err) {
        throw normalizeAIError(err, "Responses request failed");
      }
    },

    async listModels() {
      try {
        return await requestJSON(getConfig, "/models", null, "GET");
      } catch (err) {
        throw normalizeAIError(err, "Failed to fetch model list");
      }
    },

    async audioSpeech(payload) {
      try {
        return await requestBlob(getConfig, "/audio/speech", payload);
      } catch (err) {
        throw normalizeAIError(err, "TTS request failed");
      }
    }
  };
}
