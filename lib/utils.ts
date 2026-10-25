
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * A query-string value read from the live URL, falling back to `fallback`
 * (normally the page's `searchParams` prop). Client pages that are prerendered
 * in the production build receive an empty `searchParams` prop, so deep links
 * like `/assets?tab=inventory` or `/expenses?status=SUBMITTED` were ignored on
 * Vercel while working in `next dev`. On the server this returns `fallback`.
 */
export function liveSearchParam(name: string, fallback?: string | null): string | null {
    if (typeof window === "undefined") return fallback ?? null
    return new URLSearchParams(window.location.search).get(name) ?? fallback ?? null
}
