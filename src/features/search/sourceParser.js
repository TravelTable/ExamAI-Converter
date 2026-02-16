function collectOutputTextFromResponse(resp) {
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  if (!Array.isArray(resp?.output)) return "";

  const chunks = [];
  resp.output.forEach((item) => {
    if (item?.type === "message" && Array.isArray(item?.content)) {
      item.content.forEach((part) => {
        if (part?.type === "output_text" && part?.text) chunks.push(part.text);
      });
    }
    if (item?.type === "output_text" && item?.text) chunks.push(item.text);
  });

  return chunks.join("\n").trim();
}

function collectSourcesFromResponse(resp) {
  if (!Array.isArray(resp?.output)) return [];

  const sources = [];
  resp.output.forEach((item) => {
    if (item?.type !== "web_search_call") return;
    const rawSources = item?.action?.sources || item?.sources || [];
    if (!Array.isArray(rawSources)) return;

    rawSources.forEach((src) => {
      const url = src?.url || src?.link;
      if (!url) return;
      sources.push({
        title: src?.title || src?.name,
        url,
        snippet: src?.snippet || src?.text,
        publisher: src?.publisher || src?.site,
        publishedAt: src?.published_at || src?.publishedAt
      });
    });
  });

  const dedup = new Map();
  sources.forEach((s) => {
    if (!dedup.has(s.url)) dedup.set(s.url, s);
  });
  return [...dedup.values()];
}

export function parseSearchResponse(resp) {
  const answerText = collectOutputTextFromResponse(resp);
  const sources = collectSourcesFromResponse(resp);
  return {
    answerText,
    sources,
    grounded: sources.length > 0
  };
}
