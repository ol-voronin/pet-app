import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomOtp(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += String(randomInt(0, 10));
  return code;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
