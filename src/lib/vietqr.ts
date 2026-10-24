export type VietQrBank = { bin: string; shortName: string; name: string };

export function vietQrImageUrl(bankBin: string | null, accountNo: string | null) {
  if (!bankBin || !/^\d{6}$/.test(bankBin) || !accountNo || !/^\d{4,30}$/.test(accountNo)) return null;
  const query = new URLSearchParams({ addInfo: "Ung ho CapFootBall" });
  return `https://img.vietqr.io/image/${bankBin}-${accountNo}-compact2.png?${query}`;
}
