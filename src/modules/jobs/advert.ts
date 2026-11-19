/** Exact advert provenance, shared by server reports and client restoration. No CV text is hashed. */
export async function advertFingerprint(advert: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(advert));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
