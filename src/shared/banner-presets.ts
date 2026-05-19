// src/shared/banner-presets.ts

export const PRESETS = {
  niceGo:      { gradient: ["#ff5fd7", "#ff87af"] as const, title: "Oh! NICE • GO" },
  niceReview:  { gradient: ["#ff5fd7", "#ff87af"] as const, title: "Oh! NICE • REVIEW" },
  niceFix:     { gradient: ["#ff5fd7", "#ff87af"] as const, title: "Oh! NICE • FIX" },
  nicePlan:    { gradient: ["#ff5fd7", "#ff87af"] as const, title: "Oh! NICE • PLAN" },
  niceUpdate:  { gradient: ["#ff5fd7", "#ff87af"] as const, title: "Oh! NICE • UPDATE-PLAN" },
  context:     { gradient: ["#00d4ff", "#5fffd7"] as const, title: "Oh! CONTEXT" },
  search:      { gradient: ["#bd5fff", "#ff5fff"] as const, title: "Oh! SEARCH SEARCH" },
  doctor:      { gradient: ["#ff8700", "#ff5f00"] as const, title: "Oh! DOCTOR!!" },
  help:        { gradient: ["#5fff87", "#afff5f"] as const, title: "Oh! HELP?" },
} as const;
