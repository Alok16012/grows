import { createClient } from "@supabase/supabase-js"

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ""
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

/**
 * Server-side Supabase client with service-role privileges.
 * Used only in API routes – never exposed to the browser.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
})

export const PHOTO_BUCKET = "uploads"
