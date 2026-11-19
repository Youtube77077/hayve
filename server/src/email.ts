import type { Config } from './config.js';

/** Transactional email (Postmark). In development without a token the message is logged instead. */
export async function sendEmail(c: Config, to: string, subject: string, text: string) {
  if (!c.POSTMARK_TOKEN) {
    if (c.NODE_ENV === 'production') throw new Error('Email is not configured (POSTMARK_TOKEN)');
    console.log(`[email to ${to}] ${subject}\n${text}`);
    return;
  }
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Postmark-Server-Token': c.POSTMARK_TOKEN },
    body: JSON.stringify({ From: c.EMAIL_FROM, To: to, Subject: subject, TextBody: text, MessageStream: 'outbound' }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status})`);
}
