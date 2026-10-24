import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { VietQrBank } from "@/lib/vietqr";

const responseSchema = z.object({
  code: z.literal("00"),
  data: z.array(z.object({
    bin: z.string().regex(/^\d{6}$/),
    shortName: z.string().min(1),
    name: z.string().min(1),
    transferSupported: z.number().nullable(),
  })).max(500),
});

export async function listVietQrBanks(): Promise<{ data: VietQrBank[] }> {
  try {
    // Public bank catalog; no account details or credentials are sent to this endpoint.
    const response = await fetch("https://api.vietqr.io/v2/banks", { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Bank catalog unavailable");
    const result = responseSchema.parse(await response.json());
    const banks = result.data.filter((bank) => bank.transferSupported === 1)
      .map(({ bin, shortName, name }) => ({ bin, shortName, name }));
    if (!banks.length) throw new Error("Empty bank catalog");
    return { data: [...new Map(banks.map((bank) => [bank.bin, bank])).values()].sort((a, b) => a.shortName.localeCompare(b.shortName, "vi")) };
  } catch {
    throw new AppError(502, "BANKS_UNAVAILABLE", "Chưa tải được danh sách ngân hàng. Vui lòng thử lại.");
  }
}
