export function hashString(str) {
  let hash = 0;
  if (!str || str.length === 0) return String(hash);
  for (let i = 0; i < str.length; i += 1) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString();
}
