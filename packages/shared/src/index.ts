export * from "./money";
export * from "./roles";
export * from "./schemas";

/** Genera un id de link de 16 bytes en hex (BytesN<16>). */
export function newLinkId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
