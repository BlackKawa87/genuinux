export interface InviteEmailParams {
  to: string
  inviteCode: string
  expiresAt: string   // ISO string
  signupUrl: string
  note?: string | null
}

function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function betaInviteHtml(p: InviteEmailParams): string {
  const expiry = formatExpiry(p.expiresAt)
  const noteBlock = p.note
    ? `<tr><td style="padding:0 0 20px 0;font-size:14px;color:#64748B;line-height:1.6;">${p.note}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Genuinux Beta Invite</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 32px 0;" align="center">
              <span style="font-size:22px;font-weight:700;color:#0F172A;letter-spacing:-0.5px;">GENUINUX</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;padding:40px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Beta badge -->
                <tr>
                  <td style="padding:0 0 24px 0;">
                    <span style="display:inline-block;background:rgba(22,199,132,0.08);border:1px solid rgba(22,199,132,0.25);color:#0C7A4E;font-size:11px;font-weight:600;letter-spacing:0.5px;padding:4px 10px;border-radius:6px;text-transform:uppercase;">
                      Controlled Beta
                    </span>
                  </td>
                </tr>

                <!-- Headline -->
                <tr>
                  <td style="padding:0 0 12px 0;font-size:24px;font-weight:700;color:#0F172A;line-height:1.25;">
                    You're invited to Genuinux Beta
                  </td>
                </tr>

                <!-- Intro -->
                <tr>
                  <td style="padding:0 0 24px 0;font-size:15px;color:#64748B;line-height:1.6;">
                    Genuinux is an AI-powered trust infrastructure for online platforms — catch fraud, detect fake accounts, and protect your users with a single API call.
                  </td>
                </tr>

                ${noteBlock}

                <!-- Invite code block -->
                <tr>
                  <td style="padding:0 0 28px 0;">
                    <div style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:10px;padding:20px;text-align:center;">
                      <div style="font-size:11px;font-weight:600;color:#94A3B8;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">
                        Your Invite Code
                      </div>
                      <div style="font-family:'Courier New',Courier,monospace;font-size:26px;font-weight:700;color:#0F172A;letter-spacing:3px;">
                        ${p.inviteCode}
                      </div>
                    </div>
                  </td>
                </tr>

                <!-- CTA -->
                <tr>
                  <td style="padding:0 0 28px 0;" align="center">
                    <a href="${p.signupUrl}"
                      style="display:inline-block;background:#16C784;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;letter-spacing:-0.1px;">
                      Create your workspace →
                    </a>
                  </td>
                </tr>

                <!-- Expiry notice -->
                <tr>
                  <td style="padding:0 0 28px 0;font-size:13px;color:#94A3B8;text-align:center;">
                    This invite expires on <strong style="color:#64748B;">${expiry}</strong>.
                  </td>
                </tr>

                <!-- What is beta divider -->
                <tr>
                  <td style="border-top:1px solid #F1F5F9;padding:24px 0 0 0;">
                    <div style="font-size:12px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">
                      Beta access includes
                    </div>
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size:13px;color:#64748B;padding:3px 0;">✓&nbsp; Full risk analysis API</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748B;padding:3px 0;">✓&nbsp; Manual review queue</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748B;padding:3px 0;">✓&nbsp; Custom fraud rules builder</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748B;padding:3px 0;">✓&nbsp; Webhook delivery</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748B;padding:3px 0;">✓&nbsp; Shadow mode (safe to test without live impact)</td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 0 0 0;text-align:center;font-size:12px;color:#94A3B8;line-height:1.7;">
              Questions? Reply to this email or write to
              <a href="mailto:beta@genuinux.io" style="color:#64748B;text-decoration:none;">beta@genuinux.io</a><br />
              Genuinux — AI Trust Infrastructure
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function betaInviteText(p: InviteEmailParams): string {
  const expiry = formatExpiry(p.expiresAt)
  const noteBlock = p.note ? `\n${p.note}\n` : ''

  return `You're invited to Genuinux Beta
====================================
${noteBlock}
Genuinux is an AI-powered trust infrastructure for online platforms.

YOUR INVITE CODE
----------------
${p.inviteCode}

Create your workspace at:
${p.signupUrl}

This invite expires on ${expiry}.

Beta access includes:
- Full risk analysis API
- Manual review queue
- Custom fraud rules builder
- Webhook delivery
- Shadow mode (safe to test without live impact)

Questions? Write to beta@genuinux.io
`
}
