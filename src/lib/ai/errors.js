export class AIProviderError extends Error {
  constructor({ message, status = 0, provider = "comet", retriable = false }) {
    super(message || "AI request failed");
    this.name = "AIProviderError";
    this.status = status;
    this.provider = provider;
    this.retriable = retriable;
  }
}

export function normalizeAIError(err, fallbackMessage = "AI request failed") {
  if (err instanceof AIProviderError) return err;
  const status = Number(err?.status || err?.statusCode || 0);
  const retriable = status >= 500 || status === 429 || status === 408;
  return new AIProviderError({
    message: err?.message || fallbackMessage,
    status,
    provider: err?.provider || "comet",
    retriable
  });
}
