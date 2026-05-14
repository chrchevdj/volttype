# VoltType Resend DNS Status - 2026-05-14

## Result

Resend is already verified for `volttype.com`.

API proof from Resend:

- Domain id: `5701b37c-7b04-4e2c-8798-a96a3e78540a`
- Domain: `volttype.com`
- Status: `verified`
- Sending: `enabled`
- Receiving: `disabled`
- Region: `eu-west-1`

## DNS Proof

Resolved locally:

| Type | Name | Value | Status |
|---|---|---|---|
| TXT | `resend._domainkey.volttype.com` | Resend DKIM public key | Present |
| TXT | `send.volttype.com` | `v=spf1 include:amazonses.com ~all` | Present |
| MX | `send.volttype.com` | `feedback-smtp.eu-west-1.amazonses.com`, priority `10` | Present |

## Note

The old handover said to add SPF at the apex and MX at `bounce.volttype.com`. The actual verified Resend configuration for this account uses the `send.volttype.com` subdomain in `eu-west-1`, and Resend confirms those records are verified.

No DNS change was needed in this pass.
