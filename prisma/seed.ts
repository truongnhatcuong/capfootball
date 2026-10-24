import { PrismaClient } from "@prisma/client";
import provinces from "../src/data/provinces.json";
const db = new PrismaClient();
async function main() {
  for (const province of provinces) {
    await db.province.upsert({ where: { code: province.code }, create: province, update: {} });
  }
  await db.donateConfig.upsert({ where: { id: 1 }, create: { id: 1, enabled: false }, update: {} });
  console.info(`Seeded ${provinces.length} provinces. No test accounts or matches were created.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
