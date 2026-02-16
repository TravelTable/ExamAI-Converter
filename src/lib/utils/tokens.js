export function estimateTokens(str) {
  return Math.ceil(String(str || "").length / 4);
}
