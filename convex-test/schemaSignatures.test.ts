import { describe, it, expect } from "vitest";
import schema from "../convex/schema";

describe("Signatures Schema Definition", () => {
  it("defines roundSignatures table with required indexes", () => {
    const tables = schema.tables;
    expect(tables).toHaveProperty("roundSignatures");
    const roundSignatures = tables.roundSignatures as any;
    expect(roundSignatures.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ indexDescriptor: "by_round_id", fields: ["roundId"] }),
        expect.objectContaining({ indexDescriptor: "by_event_id_and_round_id", fields: ["eventId", "roundId"] }),
        expect.objectContaining({ indexDescriptor: "by_event_id_and_scope", fields: ["eventId", "scope"] }),
        expect.objectContaining({ indexDescriptor: "by_round_and_actor", fields: ["roundId", "actorId"] }),
      ]),
    );
  });

  it("includes signature fields in eventAccounts and userProfiles", () => {
    const tables = schema.tables;
    expect(tables.eventAccounts.validator.fields).toHaveProperty("signatureSpecimen");
    expect(tables.eventAccounts.validator.fields).toHaveProperty("signatureType");
    expect(tables.eventAccounts.validator.fields).toHaveProperty("signatureRegisteredAt");
    expect(tables.eventAccounts.validator.fields).toHaveProperty("titleOrAffiliation");
    expect(tables.eventAccounts.validator.fields).toHaveProperty("lastNudgeAt");
    expect(tables.eventAccounts.validator.fields).toHaveProperty("lastNudgeMessage");

    expect(tables.userProfiles.validator.fields).toHaveProperty("signatureSpecimen");
    expect(tables.userProfiles.validator.fields).toHaveProperty("signatureType");
    expect(tables.userProfiles.validator.fields).toHaveProperty("signatureRegisteredAt");
    expect(tables.userProfiles.validator.fields).toHaveProperty("titleOrAffiliation");
  });
});
