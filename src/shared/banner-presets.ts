// src/shared/banner-presets.ts

/** Per-skill gradient color stops. Applied to the banner title (and any subtitle highlights). */
export const GRADIENTS = {
  nice:    ["#ff5fd7", "#ff87af"] as const,
  context: ["#00d4ff", "#5fffd7"] as const,
  search:  ["#bd5fff", "#ff5fff"] as const,
  doctor:  ["#ff8700", "#ff5f00"] as const,
  help:    ["#5fff87", "#afff5f"] as const,
} as const;

export type SkillKey = keyof typeof GRADIENTS;
