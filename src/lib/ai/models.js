export const FALLBACK_MODELS = [
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" }
];

export function normalizeModelList(models) {
  if (!Array.isArray(models) || models.length === 0) return FALLBACK_MODELS;
  return models
    .map((m) => {
      const id = typeof m === "string" ? m : m?.id;
      if (!id) return null;
      return {
        id,
        label: typeof m?.name === "string" && m.name.trim() ? m.name : id
      };
    })
    .filter(Boolean);
}
