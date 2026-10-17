import nodemailer from "nodemailer"
import { COMPANY } from "@/lib/company"

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
})

export async function sendApprovalEmail({
    toEmails,
    clientNames,
    projectName,
    companyName,
    inspectorName,
    approvedAt,
    reviewerNotes,
    shareUrl,
    approvedByName,
}: {
    toEmails: string[]
    clientNames: string[]
    projectName: string
    companyName: string
    inspectorName: string
    approvedAt: Date
    reviewerNotes?: string | null
    shareUrl: string
    approvedByName: string
}) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn("Email not configured — skipping approval email")
        return
    }
    if (toEmails.length === 0) return

    const dateStr = approvedAt.toLocaleDateString("en-IN", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    })

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Inspection Report Approved</title>
</head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#1a9e6e;border-radius:14px 14px 0 0;padding:28px 36px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${COMPANY.name}</span>
                    <span style="font-size:12px;color:rgba(255,255,255,0.7);margin-left:8px;font-weight:500;">Quality Inspection</span>
                  </td>
                  <td align="right">
                    <span style="background:rgba(255,255,255,0.2);color:#ffffff;font-size:11px;font-weight:700;padding:5px 12px;border-radius:20px;letter-spacing:0.5px;">✅ APPROVED</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- White card body -->
          <tr>
            <td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #e8e6e1;border-right:1px solid #e8e6e1;">

              <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#1a1a18;line-height:1.3;">
                Inspection Report Ready
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b6860;line-height:1.6;">
                The inspection report for <strong style="color:#1a1a18;">${projectName}</strong> has been reviewed and approved. You can now view the complete report.
              </p>

              <!-- Details grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f8f5;border-radius:10px;border:1px solid #e8e6e1;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;width:50%;vertical-align:top;">
                          <p style="margin:0;font-size:10px;font-weight:700;color:#9e9b95;text-transform:uppercase;letter-spacing:0.6px;">Company</p>
                          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#1a1a18;">${companyName}</p>
                        </td>
                        <td style="padding:6px 0;width:50%;vertical-align:top;">
                          <p style="margin:0;font-size:10px;font-weight:700;color:#9e9b95;text-transform:uppercase;letter-spacing:0.6px;">Project</p>
                          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#1a1a18;">${projectName}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 6px;vertical-align:top;">
                          <p style="margin:0;font-size:10px;font-weight:700;color:#9e9b95;text-transform:uppercase;letter-spacing:0.6px;">Inspector</p>
                          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#1a1a18;">${inspectorName}</p>
                        </td>
                        <td style="padding:12px 0 6px;vertical-align:top;">
                          <p style="margin:0;font-size:10px;font-weight:700;color:#9e9b95;text-transform:uppercase;letter-spacing:0.6px;">Approved On</p>
                          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#1a1a18;">${dateStr}</p>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding:12px 0 6px;vertical-align:top;">
                          <p style="margin:0;font-size:10px;font-weight:700;color:#9e9b95;text-transform:uppercase;letter-spacing:0.6px;">Approved By</p>
                          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#1a9e6e;">${approvedByName}</p>
                        </td>
                      </tr>
                      ${reviewerNotes ? `
                      <tr>
                        <td colspan="2" style="padding:12px 0 6px;vertical-align:top;">
                          <p style="margin:0;font-size:10px;font-weight:700;color:#9e9b95;text-transform:uppercase;letter-spacing:0.6px;">Reviewer Notes</p>
                          <p style="margin:4px 0 0;font-size:13px;color:#1a1a18;line-height:1.5;">${reviewerNotes}</p>
                        </td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${shareUrl}" style="display:inline-block;background:#1a9e6e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">
                      View Full Report →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:#9e9b95;text-align:center;line-height:1.6;">
                This link is shareable and does not require login.<br/>
                If you have questions, please contact your project manager.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f8f5;border:1px solid #e8e6e1;border-top:none;border-radius:0 0 14px 14px;padding:18px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:11px;color:#9e9b95;">
                      ${COMPANY.name} — ${COMPANY.legalName}<br/>
                      Developed by <a href="${COMPANY.developerUrl}" style="color:#1a9e6e;text-decoration:none;">${COMPANY.developerCredit}</a>
                    </p>
                  </td>
                  <td align="right">
                    <p style="margin:0;font-size:11px;color:#c5c3bd;">Automated notification</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    await transporter.sendMail({
        from: `"${COMPANY.name}" <${process.env.GMAIL_USER}>`,
        to: toEmails.join(", "),
        subject: `✅ Inspection Report Approved — ${projectName} (${companyName})`,
        html,
    })

    console.log(`Approval email sent to: ${toEmails.join(", ")}`)
}
