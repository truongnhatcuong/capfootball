import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;

export function getMailTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) return null;
  if (transport) return transport;

  const port = Number(process.env.SMTP_PORT || "465");
  const secure = process.env.SMTP_SECURE || String(port === 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !["true", "false"].includes(secure)) {
    logger.warn("Invalid SMTP_PORT or SMTP_SECURE configuration");
    return null;
  }

  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: secure === "true",
    requireTLS: secure === "false",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transport;
}
