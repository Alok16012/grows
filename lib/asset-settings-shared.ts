// Assets → Settings: types, defaults and checks (client-safe; storage in lib/asset-settings).

export type AssetSettings = {
    acknowledgement: {
        /** Remind the employee to confirm receipt after this many days. 0 = no reminders. */
        remindAfterDays: number
        /** Also tell the issuers about receipts not confirmed after this many days. 0 = never. */
        tellIssuersAfterDays: number
    }
    kits: {
        /** Joiners within this many days show under "New joiners needing a kit". */
        joinerWindowDays: number
    }
    stock: {
        /** Daily message to issuers when an item is at or below its reorder level. */
        lowStockAlert: boolean
    }
}

export const DEFAULT_ASSET_SETTINGS: AssetSettings = {
    acknowledgement: { remindAfterDays: 2, tellIssuersAfterDays: 7 },
    kits: { joinerWindowDays: 30 },
    stock: { lowStockAlert: true },
}

const num = (v: unknown, d: number, min = 0, max = 365) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d }

export function sanitizeAssetSettings(v: any): AssetSettings {
    const d = DEFAULT_ASSET_SETTINGS
    return {
        acknowledgement: {
            remindAfterDays: num(v?.acknowledgement?.remindAfterDays, d.acknowledgement.remindAfterDays),
            tellIssuersAfterDays: num(v?.acknowledgement?.tellIssuersAfterDays, d.acknowledgement.tellIssuersAfterDays),
        },
        kits: { joinerWindowDays: num(v?.kits?.joinerWindowDays, d.kits.joinerWindowDays) },
        stock: { lowStockAlert: typeof v?.stock?.lowStockAlert === "boolean" ? v.stock.lowStockAlert : d.stock.lowStockAlert },
    }
}

