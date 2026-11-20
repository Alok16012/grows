import { redirect } from "next/navigation"

// Settings → WhatsApp became part of the Communication Center.
export default function WhatsAppSettingsMoved() {
    redirect("/admin/communication")
}
