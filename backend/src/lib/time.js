export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function toUnix(value) {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}
