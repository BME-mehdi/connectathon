import { describe, it, expect } from "vitest";
import { FamilyMemberSchema } from "./screening";

describe("FamilyMemberSchema", () => {
  it("validates a minor child without email", () => {
    const res = FamilyMemberSchema.safeParse({
      full_name: "Amine El Aissi",
      relation: "child",
      is_minor: true,
      date_of_birth: "2016-04-12",
    });
    expect(res.success).toBe(true);
  });

  it("validates a member with an optional email", () => {
    const res = FamilyMemberSchema.safeParse({
      full_name: "Fatma El Aissi",
      relation: "child",
      is_minor: true,
      date_of_birth: "2018-09-20",
      email: "parent@example.com",
    });
    expect(res.success).toBe(true);
  });
});
