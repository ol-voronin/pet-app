import type { FastifyBaseLogger } from 'fastify';
import type { OtpSender } from './types.js';

/** Dev/test sender: logs the code instead of sending it. Production uses Viber → SMS (not implemented yet). */
export class LogOtpSender implements OtpSender {
  readonly sent: { phone: string; code: string }[] = [];
  log: FastifyBaseLogger | undefined;

  send(phone: string, code: string) {
    this.sent.push({ phone, code });
    this.log?.info({ phone: `${phone.slice(0, 7)}***`, code }, 'OTP (dev sender)');
    return Promise.resolve();
  }
}
