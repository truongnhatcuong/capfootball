import pino from "pino";
export const logger = pino({ level: process.env.LOG_LEVEL ?? "info", redact: ["email", "phone", "zaloPhone", "body", "token", "password", "req.headers.authorization", "req.headers.cookie"] });
