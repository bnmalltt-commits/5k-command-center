import { createClient } from "@supabase/supabase-js";

// Lazily created so missing Supabase env vars don't break `next build`.
let client: ReturnType<typeof createClient> | undefined;
function bucket() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client.storage.from("evidence");
}

// Mimics the Cloudflare R2 bucket shape (`env.BUCKET.put/get/delete`) so the
// route code needs minimal changes.
export const storage = {
  async put(key: string, body: ReadableStream | ArrayBuffer | Blob, options?: { httpMetadata?: { contentType?: string } }) {
    const { error } = await bucket().upload(key, body as any, {
      contentType: options?.httpMetadata?.contentType,
      upsert: true,
    });
    if (error) throw error;
  },
  async get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null> {
    const { data, error } = await bucket().download(key);
    if (error || !data) return null;
    return { body: data.stream(), httpMetadata: { contentType: data.type } };
  },
  async delete(key: string) {
    await bucket().remove([key]);
  },
};
