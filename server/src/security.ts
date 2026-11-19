import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { jwtVerify, SignJWT } from 'jose';
import * as OTPAuth from 'otpauth';

/** Passwords: argon2id (OWASP recommended parameters). */
export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters';
  if (pw.length > 200) return 'Password is too long';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9\W]/.test(pw)) return 'Mix letters with numbers or symbols';
  return null;
}

export const randomToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/* ------------------------------------------------------------ sessions -- */

export interface Session {
  sub: string;
  aal: 'aal1' | 'aal2';
  sv: number;
}

export async function signSession(secret: string, s: Session) {
  return new SignJWT({ aal: s.aal, sv: s.sv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.sub)
    .setIssuedAt()
    .setIssuer('hayve-api')
    .setExpirationTime(s.aal === 'aal2' ? '12h' : '7d')
    .sign(new TextEncoder().encode(secret));
}

export async function readSession(secret: string, token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'hayve-api', algorithms: ['HS256'] });
    if (!payload.sub || (payload.aal !== 'aal1' && payload.aal !== 'aal2') || typeof payload.sv !== 'number') return null;
    return { sub: payload.sub, aal: payload.aal, sv: payload.sv };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- TOTP -- */

export function newTotpSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, email: string) {
  return new OTPAuth.TOTP({ issuer: 'Hayve', label: email, secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' }).toString();
}

export function verifyTotp(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' });
  return totp.validate({ token: code, window: 1 }) !== null;
}
