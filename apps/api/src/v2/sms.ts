import { Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * OTP delivery. With MSG91 configured (MSG91_AUTH_KEY + MSG91_OTP_TEMPLATE_ID) codes go out by SMS;
 * otherwise, outside production, the code is written to the server log so it can be tested.
 */
const log = new Logger('SMS');

export function smsConfigured() {
  return !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID);
}

export async function sendOtp(phone: string, code: string): Promise<void> {
  const digits = phone.replace(/\D/g, '');
  const mobile = digits.length === 10 ? `91${digits}` : digits;
  if (!smsConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('SMS is not set up on the server yet — sign in with your password');
    log.warn(`OTP for ${mobile}: ${code} (SMS provider not configured)`);
    return;
  }
  const res = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: process.env.MSG91_AUTH_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ template_id: process.env.MSG91_OTP_TEMPLATE_ID, short_url: '0', recipients: [{ mobiles: mobile, otp: code }] }),
  });
  if (!res.ok) {
    log.error(`MSG91 failed: ${res.status} ${await res.text().catch(() => '')}`);
    throw new ServiceUnavailableException('Could not send the OTP — try again or use your password');
  }
}
