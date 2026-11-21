// Assets → Settings storage. Every limit for the asset workflow lives here
// (nothing fixed in code). Types and checks: lib/asset-settings-shared.
import prisma from "@/lib/prisma"
import { sanitizeAssetSettings, type AssetSettings } from "@/lib/asset-settings-shared"
export * from "@/lib/asset-settings-shared"

const KEY = "assetSettings"

export async function getAssetSettings(): Promise<AssetSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return sanitizeAssetSettings(row?.value ? JSON.parse(row.value) : {})
    } catch { return sanitizeAssetSettings({}) }
}

export async function saveAssetSettings(input: unknown, userId: string): Promise<AssetSettings> {
    const s = sanitizeAssetSettings(input)
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return s
}
