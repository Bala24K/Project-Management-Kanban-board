/** Unique id per browser tab; sent with every request and the SSE connection. */
let clientId: string | null = null;

export function getClientId(): string {
  if (!clientId) clientId = uuid().replace(/-/g, "");
  return clientId;
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // RFC4122 v4 fallback for non-secure contexts.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
