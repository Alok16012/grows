// Single source of truth for company / product branding.
//
// Every screen, PDF and email that shows the company or product name reads
// it from here. Change the brand in one place (or via env) and it follows
// everywhere. Safe to import from both server and client code — it holds
// only plain strings and NEXT_PUBLIC_* env values, which Next inlines at
// build time.

import pkg from "../package.json"

const env = (value: string | undefined) => {
    const v = value?.trim()
    return v ? v : undefined
}

/** Product name shown in the UI, metadata, emails and PDF footers. */
const name = env(process.env.NEXT_PUBLIC_COMPANY_NAME) ?? "Growus ERP"

/** Registered legal entity for letterheads, signatures and HR documents. */
const legalName = env(process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME) ?? "Growus Auto India Pvt. Ltd."

/** First word of the product name, e.g. "Growus" — used where the brand is
 *  rendered in two colours ("Growus" + "ERP") or in casual copy. */
const shortName = name.split(/\s+/)[0] || name

export const COMPANY = {
    name,
    legalName,
    shortName,
    /** What follows `shortName` in `name`, e.g. "ERP". Empty when the name
     *  is a single word. */
    nameSuffix: name.slice(shortName.length).trim(),
    tagline: "Pioneer in outsourcing",
    supportLine: "Contact your HR or admin.",
    developerCredit: "Blinks AI",
    developerUrl: "https://blinks-ai.com",
    version: (pkg as { version?: string }).version ?? "0.0.0",
} as const

export type Company = typeof COMPANY
