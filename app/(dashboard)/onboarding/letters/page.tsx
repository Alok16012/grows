// HR letters moved to Documents → HR Letters → Auto letters. Old links still work.
import { redirect } from "next/navigation"

export default function OldLettersPage() {
    redirect("/documents/letters")
}
