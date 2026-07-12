// Server-side business config. All values come from env so the founder can
// change price/commission/model without a deploy code change.

export const config = {
  aiModel: process.env.AI_MODEL || "claude-haiku-4-5",
  aiMonthlyIncluded: parseInt(process.env.AI_MONTHLY_INCLUDED || "30", 10),
  semesterPriceKobo: parseInt(process.env.SEMESTER_PRICE_KOBO || "100000", 10),
  semesterLabel: process.env.SEMESTER_LABEL || "2024/2025 Rain",
  repCommissionPercent: parseInt(process.env.REP_COMMISSION_PERCENT || "15", 10),
  referralMonthlyCap: parseInt(process.env.REFERRAL_MONTHLY_CAP || "10", 10),
  // Semester unlocks run ~5 months from payment.
  semesterDurationDays: 150,
  trialDays: 3,
};
