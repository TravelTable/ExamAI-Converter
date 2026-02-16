import { parseSearchResponse } from "./sourceParser";

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function getCacheKey({ model, query, searchContextSize }) {
  return `${model || ""}::${searchContextSize || "medium"}::${String(query || "").trim().toLowerCase()}`;
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value) {
  cache.set(key, { ts: Date.now(), value });
}

export function createSearchService(aiClient) {
  return {
    async searchWeb({ model, query, searchContextSize = "medium" }) {
      const key = getCacheKey({ model, query, searchContextSize });
      const cached = getCached(key);
      if (cached) return cached;

      const payload = {
        model,
        input: query,
        tools: [
          {
            type: "web_search_preview",
            search_context_size: searchContextSize,
            user_location: {
              type: "approximate",
              country: "US"
            }
          }
        ],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"]
      };

      const response = await aiClient.responses(payload);
      const parsed = parseSearchResponse(response);
      setCached(key, parsed);
      return parsed;
    }
  };
}
