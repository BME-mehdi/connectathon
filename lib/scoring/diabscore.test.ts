import { describe, it, expect } from "vitest";
import { computeDiabscore, FORMULA_VERSION, type DiabscoreInputs } from "./diabscore";

/**
 * DIABSCORE Unit Tests
 * Spec requirement: "unit tests covering every DIABSCORE tier boundary."
 * All tier boundaries (79/80, 89/90) are tested from multiple directions.
 */

// Base: age 32 + WHtR 70/200×100=35 → core 67 (low risk, no bonuses)
const BASE: DiabscoreInputs = {
  age: 32,
  waist_cm: 70,
  height_cm: 200,
  family_history_t2d: false,
  gestational_diabetes_history: null,
};

describe("computeDiabscore", () => {
  it("returns the correct formula version", () => {
    expect(computeDiabscore(BASE).formula_version).toBe(FORMULA_VERSION);
    expect(computeDiabscore(BASE).formula_version).toBe("diabscore-v1.0");
  });

  // ── Tier: LOW ──────────────────────────────────────────────────────────────

  describe("LOW tier (score < 80)", () => {
    it("score 67 (base) → low", () => {
      const r = computeDiabscore(BASE);
      expect(r.breakdown.total).toBe(67);
      expect(r.tier).toBe("low");
    });

    it("score exactly 79 → low (boundary below moderate)", () => {
      // age 44 + WHtR 35 = 79
      const r = computeDiabscore({ ...BASE, age: 44 });
      expect(r.breakdown.total).toBe(79);
      expect(r.tier).toBe("low");
    });

    it("score 43 (young, slim) → low", () => {
      const r = computeDiabscore({ age: 18, waist_cm: 50, height_cm: 200, family_history_t2d: false, gestational_diabetes_history: null });
      expect(r.breakdown.total).toBe(43);
      expect(r.tier).toBe("low");
    });
  });

  // ── Tier: MODERATE ─────────────────────────────────────────────────────────

  describe("MODERATE tier (80 ≤ score < 90)", () => {
    it("score exactly 80 → moderate (lower boundary)", () => {
      const r = computeDiabscore({ ...BASE, age: 45 });
      expect(r.breakdown.total).toBe(80);
      expect(r.tier).toBe("moderate");
    });

    it("score exactly 85 → moderate (midpoint)", () => {
      const r = computeDiabscore({ ...BASE, age: 50 });
      expect(r.breakdown.total).toBe(85);
      expect(r.tier).toBe("moderate");
    });

    it("score exactly 89 → moderate (upper boundary)", () => {
      const r = computeDiabscore({ ...BASE, age: 54 });
      expect(r.breakdown.total).toBe(89);
      expect(r.tier).toBe("moderate");
    });
  });

  // ── Tier: HIGH ─────────────────────────────────────────────────────────────

  describe("HIGH tier (score ≥ 90)", () => {
    it("score exactly 90 → high (lower boundary)", () => {
      const r = computeDiabscore({ ...BASE, age: 55 });
      expect(r.breakdown.total).toBe(90);
      expect(r.tier).toBe("high");
    });

    it("score 120 (age 55 + WHtR 55 + family history) → high", () => {
      const r = computeDiabscore({
        age: 55,
        waist_cm: 110,
        height_cm: 200, // WHtR = 0.55 → 55 pts
        family_history_t2d: true,
        gestational_diabetes_history: null,
      });
      expect(r.breakdown.total).toBe(120);
      expect(r.tier).toBe("high");
    });
  });

  // ── Individual factor correctness ─────────────────────────────────────────

  describe("family_history_t2d", () => {
    it("adds exactly +10 pts when true", () => {
      const no = computeDiabscore({ ...BASE, family_history_t2d: false });
      const yes = computeDiabscore({ ...BASE, family_history_t2d: true });
      expect(yes.breakdown.family_history_points).toBe(10);
      expect(yes.breakdown.total - no.breakdown.total).toBe(10);
    });
    it("adds 0 pts when false", () => {
      expect(computeDiabscore({ ...BASE, family_history_t2d: false }).breakdown.family_history_points).toBe(0);
    });
  });

  describe("gestational_diabetes_history", () => {
    it("adds exactly +25 pts when true", () => {
      const no = computeDiabscore({ ...BASE, gestational_diabetes_history: false });
      const yes = computeDiabscore({ ...BASE, gestational_diabetes_history: true });
      expect(yes.breakdown.gestational_diabetes_points).toBe(25);
      expect(yes.breakdown.total - no.breakdown.total).toBe(25);
    });
    it("adds 0 pts when null (not applicable)", () => {
      expect(computeDiabscore({ ...BASE, gestational_diabetes_history: null }).breakdown.gestational_diabetes_points).toBe(0);
    });
    it("adds 0 pts when false", () => {
      expect(computeDiabscore({ ...BASE, gestational_diabetes_history: false }).breakdown.gestational_diabetes_points).toBe(0);
    });
  });

  describe("WHtR calculation", () => {
    it("computes WHtR×100 rounded to 1 decimal", () => {
      // 73 / 170 = 0.42941… → 42.9
      const r = computeDiabscore({ ...BASE, waist_cm: 73, height_cm: 170 });
      expect(r.breakdown.whtr_points).toBe(42.9);
    });
    it("computes exact 0.5 WHtR as 50 pts", () => {
      const r = computeDiabscore({ ...BASE, waist_cm: 88, height_cm: 176 });
      expect(r.breakdown.whtr_points).toBe(50);
    });
  });

  // ── FINDRISC-lite ──────────────────────────────────────────────────────────

  describe("FINDRISC-lite add-ons", () => {
    it("+5 for low activity", () => {
      const r = computeDiabscore({ ...BASE, activity_level: "low" });
      expect(r.breakdown.findrisc_bonus).toBe(5);
    });
    it("0 for high/moderate activity", () => {
      expect(computeDiabscore({ ...BASE, activity_level: "high" }).breakdown.findrisc_bonus).toBe(0);
      expect(computeDiabscore({ ...BASE, activity_level: "moderate" }).breakdown.findrisc_bonus).toBe(0);
    });
    it("+3 for diet_score ≤ 2", () => {
      expect(computeDiabscore({ ...BASE, diet_score: 1 }).breakdown.findrisc_bonus).toBe(3);
      expect(computeDiabscore({ ...BASE, diet_score: 2 }).breakdown.findrisc_bonus).toBe(3);
    });
    it("0 for diet_score > 2", () => {
      expect(computeDiabscore({ ...BASE, diet_score: 3 }).breakdown.findrisc_bonus).toBe(0);
    });
    it("+5 for bp_medication", () => {
      const r = computeDiabscore({ ...BASE, bp_medication: true });
      expect(r.breakdown.findrisc_bonus).toBe(5);
    });
    it("all three bonuses stack to +13", () => {
      const r = computeDiabscore({ ...BASE, activity_level: "low", diet_score: 1, bp_medication: true });
      expect(r.breakdown.findrisc_bonus).toBe(13);
    });
    it("null fields apply 0 bonus", () => {
      const r = computeDiabscore({ ...BASE, activity_level: null, diet_score: null, bp_medication: null });
      expect(r.breakdown.findrisc_bonus).toBe(0);
    });
  });

  // ── Cross-factor boundary crossings ───────────────────────────────────────

  describe("combined factor boundary crossings", () => {
    it("family history alone does not push 79 to high (79+10=89 → moderate)", () => {
      const r = computeDiabscore({ age: 44, waist_cm: 70, height_cm: 200, family_history_t2d: true, gestational_diabetes_history: null });
      expect(r.breakdown.total).toBe(89);
      expect(r.tier).toBe("moderate");
    });

    it("family history pushes 80 to high (80+10=90)", () => {
      const r = computeDiabscore({ age: 45, waist_cm: 70, height_cm: 200, family_history_t2d: true, gestational_diabetes_history: null });
      expect(r.breakdown.total).toBe(90);
      expect(r.tier).toBe("high");
    });

    it("GDM alone can push a low-base person to high risk", () => {
      // age 40 + WHtR ~30 + GDM 25 ≈ 95 → high
      const r = computeDiabscore({ age: 40, waist_cm: 54, height_cm: 180, family_history_t2d: false, gestational_diabetes_history: true });
      expect(r.tier).toBe("high");
    });

    it("FINDRISC bonus can push moderate to high (89+5=94)", () => {
      const r = computeDiabscore({ age: 54, waist_cm: 70, height_cm: 200, family_history_t2d: false, gestational_diabetes_history: null, activity_level: "low" });
      expect(r.breakdown.total).toBe(94);
      expect(r.tier).toBe("high");
    });
  });
});
