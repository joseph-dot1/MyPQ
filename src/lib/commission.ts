// Class-rep commission math. Pure so it can be unit-tested and reused by the
// Paystack webhook + manual-grant path.

export function computeCommissionKobo(amountKobo: number, percent: number): number {
  if (amountKobo <= 0 || percent <= 0) return 0;
  return Math.floor((amountKobo * percent) / 100);
}
