// Default reward tiers used until a configurable reward_rules editor ships.
// Pure client-side derivation from the passport's stamp count and the
// event's active venue count. No PII, no DB calls.

export type RewardTier = {
  key: "bronze" | "silver" | "gold";
  label: string;
  threshold: number;
  unlocked: boolean;
  progress: number; // 0..1
};

export type RewardSummary = {
  tiers: RewardTier[];
  isDefault: true; // becomes false once configurable rewards land
  stampedCount: number;
  totalVenues: number;
};

export function computeDefaultRewardTiers(
  stampedCount: number,
  totalVenues: number,
): RewardSummary {
  const stamps = Math.max(0, stampedCount | 0);
  const total = Math.max(0, totalVenues | 0);

  // Gold = all venues if small (<= 8), otherwise 8.
  const goldThreshold =
    total > 0 ? Math.min(total, 8) : 8;
  // Silver = 5 (capped to total if smaller than 5 and > 3).
  const silverThreshold =
    total > 0 && total < 5 ? Math.max(3, Math.min(total - 1, goldThreshold - 1)) : 5;
  // Bronze = 3 (capped to 1 below silver if total small).
  const bronzeThreshold =
    total > 0 && total < 3 ? Math.max(1, Math.min(total, silverThreshold)) : 3;

  const tiers: RewardTier[] = [
    {
      key: "bronze",
      label: "Bronze",
      threshold: bronzeThreshold,
      unlocked: stamps >= bronzeThreshold,
      progress: clamp01(stamps / bronzeThreshold),
    },
    {
      key: "silver",
      label: "Silver",
      threshold: silverThreshold,
      unlocked: stamps >= silverThreshold,
      progress: clamp01(stamps / silverThreshold),
    },
    {
      key: "gold",
      label: "Gold",
      threshold: goldThreshold,
      unlocked: stamps >= goldThreshold,
      progress: clamp01(stamps / goldThreshold),
    },
  ];

  // Dedupe / order — if total is tiny the thresholds may collapse.
  const seen = new Set<number>();
  const dedup = tiers.filter((t) => {
    if (seen.has(t.threshold)) return false;
    seen.add(t.threshold);
    return true;
  });

  return {
    tiers: dedup,
    isDefault: true,
    stampedCount: stamps,
    totalVenues: total,
  };
}

function clamp01(n: number) {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
