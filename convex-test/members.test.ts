/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { aliceIdentity, bobIdentity, seedAndProvision, setupTest } from "./setup";

type MemberListEntry = {
  membershipId: Id<"organizationMembers">;
  userId: Id<"userProfiles">;
  name: string;
  email: string;
  image: string;
  roleName: string;
  status: "active" | "invited" | "inactive";
  joinedAt: number;
};

async function orgIdOf(
  t: ReturnType<typeof setupTest>,
  orgSlug: string,
): Promise<Id<"organizations">> {
  const org = await t.withIdentity(aliceIdentity).query(api.organizations.get, {
    orgSlug,
  });
  return org._id;
}

async function setUsage(
  t: ReturnType<typeof setupTest>,
  orgId: Id<"organizations">,
  resource: string,
  count: number,
): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("usage")
      .withIndex("by_org_id_and_resource", (q) =>
        q.eq("orgId", orgId).eq("resource", resource),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { count });
    } else {
      await ctx.db.insert("usage", {
        orgId,
        resource,
        count,
        periodKey: null,
      });
    }
  });
}

async function expireInvitation(
  t: ReturnType<typeof setupTest>,
  token: string,
): Promise<void> {
  await t.run(async (ctx) => {
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!inv) throw new Error("invitation not found");
    await ctx.db.patch(inv._id, { expiresAt: Date.now() - 1000 });
  });
}

async function membershipOf(
  t: ReturnType<typeof setupTest>,
  orgSlug: string,
  email: string,
): Promise<MemberListEntry> {
  const members = await t
    .withIdentity(aliceIdentity)
    .query(api.members.list, { orgSlug });
  const found = members.find((m) => m.email === email);
  if (!found) throw new Error(`membership for ${email} not found`);
  return found;
}

describe("members & invitations", () => {
  it("invites, then the invitee accepts and becomes a member", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    await t.withIdentity(aliceIdentity).mutation(api.invitations.create, {
      orgSlug: "acme",
      email: "bob@example.com",
      roleName: "Judge",
    });

    const pending = await t
      .withIdentity(bobIdentity)
      .query(api.invitations.listForUser, {});
    expect(pending.length).toBe(1);
    expect(pending[0].email).toBe("bob@example.com");
    expect(pending[0].status).toBe("pending");

    await t
      .withIdentity(bobIdentity)
      .mutation(api.invitations.accept, { token: pending[0].token });

    const members = await t
      .withIdentity(aliceIdentity)
      .query(api.members.list, { orgSlug: "acme" });
    const bob = members.find((m) => m.email === "bob@example.com");
    expect(bob).toBeTruthy();
    expect(bob?.roleName).toBe("Judge");
    expect(bob?.status).toBe("active");
  });

  it("rejects an invitation addressed to a different email (FORBIDDEN)", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    const token = await t.withIdentity(aliceIdentity).mutation(
      api.invitations.create,
      {
        orgSlug: "acme",
        email: "someone-else@example.com",
        roleName: "Viewer",
      },
    );

    // Bob's listForUser should not surface it.
    const pending = await t
      .withIdentity(bobIdentity)
      .query(api.invitations.listForUser, {});
    expect(pending.length).toBe(0);

    // Bob can't accept it via the token either.
    await expect(
      t
        .withIdentity(bobIdentity)
        .mutation(api.invitations.accept, { token }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("expires invitations past their TTL (CONFLICT)", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    const token = await t.withIdentity(aliceIdentity).mutation(
      api.invitations.create,
      {
        orgSlug: "acme",
        email: "bob@example.com",
        roleName: "Viewer",
      },
    );

    // Patch expiresAt into the past directly (convex-test 0.0.55 has no
    // time-advance API; t.run() exposes the mock mutation ctx).
    await expireInvitation(t, token);

    await expect(
      t
        .withIdentity(bobIdentity)
        .mutation(api.invitations.accept, { token }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

    // Re-accepting still fails (CONFLICT) — the expiry check is deterministic
    // and does not depend on a side-effecting status patch (which Convex
    // would roll back alongside the throw).
    await expect(
      t
        .withIdentity(bobIdentity)
        .mutation(api.invitations.accept, { token }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("enforces maxMembers: blocks an invite at the ceiling (LIMIT_EXCEEDED)", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    // Push the org's member usage up to the Free plan ceiling (maxMembers = 5).
    const orgId = await orgIdOf(t, "acme");
    await setUsage(t, orgId, "members", 5);

    await expect(
      t.withIdentity(aliceIdentity).mutation(api.invitations.create, {
        orgSlug: "acme",
        email: "carol@example.com",
        roleName: "Viewer",
      }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  });

  it("refuses to demote the owner (CONFLICT)", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    const aliceMembership = await membershipOf(t, "acme", "alice@example.com");
    expect(aliceMembership.roleName).toBe("Org Owner");

    await expect(
      t.withIdentity(aliceIdentity).mutation(api.members.changeRole, {
        orgSlug: "acme",
        membershipId: aliceMembership.membershipId,
        roleName: "Judge",
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("refuses to remove the owner (CONFLICT)", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    const aliceMembership = await membershipOf(t, "acme", "alice@example.com");

    await expect(
      t.withIdentity(aliceIdentity).mutation(api.members.remove, {
        orgSlug: "acme",
        membershipId: aliceMembership.membershipId,
      }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });

  it("non-admin member cannot invite (FORBIDDEN)", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    // Invite Bob as a Viewer (Viewer lacks organization.members.manage).
    const token = await t.withIdentity(aliceIdentity).mutation(
      api.invitations.create,
      {
        orgSlug: "acme",
        email: "bob@example.com",
        roleName: "Viewer",
      },
    );
    await t
      .withIdentity(bobIdentity)
      .mutation(api.invitations.accept, { token });

    await expect(
      t.withIdentity(bobIdentity).mutation(api.invitations.create, {
        orgSlug: "acme",
        email: "carol@example.com",
        roleName: "Viewer",
      }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("admin can change a non-owner member's role and remove a member", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    const token = await t.withIdentity(aliceIdentity).mutation(
      api.invitations.create,
      {
        orgSlug: "acme",
        email: "bob@example.com",
        roleName: "Viewer",
      },
    );
    await t
      .withIdentity(bobIdentity)
      .mutation(api.invitations.accept, { token });

    const bobBefore = await membershipOf(t, "acme", "bob@example.com");
    expect(bobBefore.roleName).toBe("Viewer");

    await t.withIdentity(aliceIdentity).mutation(api.members.changeRole, {
      orgSlug: "acme",
      membershipId: bobBefore.membershipId,
      roleName: "Tabulator",
    });
    const bobAfter = await membershipOf(t, "acme", "bob@example.com");
    expect(bobAfter.roleName).toBe("Tabulator");

    await t.withIdentity(aliceIdentity).mutation(api.members.remove, {
      orgSlug: "acme",
      membershipId: bobAfter.membershipId,
    });
    const members = await t
      .withIdentity(aliceIdentity)
      .query(api.members.list, { orgSlug: "acme" });
    const bobRemoved = members.find((m) => m.email === "bob@example.com");
    expect(bobRemoved?.status).toBe("inactive");
  });

  it("revokes a pending invitation (REVOKE → no longer accept-able)", async () => {
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);
    await seedAndProvision(t, bobIdentity);
    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    const token = await t.withIdentity(aliceIdentity).mutation(
      api.invitations.create,
      {
        orgSlug: "acme",
        email: "bob@example.com",
        roleName: "Viewer",
      },
    );

    // Discover the invitation id via listForOrg so we exercise that path too.
    const orgInvites = await t
      .withIdentity(aliceIdentity)
      .query(api.invitations.listForOrg, { orgSlug: "acme" });
    expect(orgInvites.length).toBe(1);
    const inviteId = orgInvites[0]._id;

    await t.withIdentity(aliceIdentity).mutation(api.invitations.revoke, {
      orgSlug: "acme",
      invitationId: inviteId,
    });

    // Bob can no longer accept it.
    await expect(
      t
        .withIdentity(bobIdentity)
        .mutation(api.invitations.accept, { token }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  it("closes the accept-time quota bypass: 5th accept hits LIMIT_EXCEEDED (Finding 1)", async () => {
    // Free plan maxMembers=5. Org owner (Alice) occupies slot 1. Four
    // invitees accept to fill the org to the ceiling (5 active). A fifth
    // invitation's accept must be refused by `requireLimit` inside
    // `accept` — the exact code path this fix adds.
    const t = setupTest();
    await seedAndProvision(t, aliceIdentity);

    const carolIdentity = {
      tokenIdentifier: "carol-token",
      subject: "carol-subject",
      name: "Carol",
      email: "carol@example.com",
      pictureUrl: "https://example.com/c.png",
      issuer: "https://tabulation.example.com",
    } as const;
    const daveIdentity = {
      tokenIdentifier: "dave-token",
      subject: "dave-subject",
      name: "Dave",
      email: "dave@example.com",
      pictureUrl: "https://example.com/d.png",
      issuer: "https://tabulation.example.com",
    } as const;
    const eveIdentity = {
      tokenIdentifier: "eve-token",
      subject: "eve-subject",
      name: "Eve",
      email: "eve@example.com",
      pictureUrl: "https://example.com/e.png",
      issuer: "https://tabulation.example.com",
    } as const;
    const frankIdentity = {
      tokenIdentifier: "frank-token",
      subject: "frank-subject",
      name: "Frank",
      email: "frank@example.com",
      pictureUrl: "https://example.com/f.png",
      issuer: "https://tabulation.example.com",
    } as const;

    await seedAndProvision(t, bobIdentity);
    await seedAndProvision(t, carolIdentity);
    await seedAndProvision(t, daveIdentity);
    await seedAndProvision(t, eveIdentity);
    await seedAndProvision(t, frankIdentity);

    await t
      .withIdentity(aliceIdentity)
      .mutation(api.organizations.create, { name: "Acme", slug: "acme" });

    // Mint 5 invitations up front. At create time usage.members=1, well
    // below the ceiling, so all five `create` calls succeed.
    const invite = (email: string) =>
      t.withIdentity(aliceIdentity).mutation(api.invitations.create, {
        orgSlug: "acme",
        email,
        roleName: "Viewer",
      });
    const bobToken = await invite("bob@example.com");
    const carolToken = await invite("carol@example.com");
    const daveToken = await invite("dave@example.com");
    const eveToken = await invite("eve@example.com");
    const frankToken = await invite("frank@example.com");

    // First four accepts succeed and bring the org to the ceiling.
    await t
      .withIdentity(bobIdentity)
      .mutation(api.invitations.accept, { token: bobToken });
    await t
      .withIdentity(carolIdentity)
      .mutation(api.invitations.accept, { token: carolToken });
    await t
      .withIdentity(daveIdentity)
      .mutation(api.invitations.accept, { token: daveToken });
    await t
      .withIdentity(eveIdentity)
      .mutation(api.invitations.accept, { token: eveToken });

    // Fifth accept: org is at maxMembers=5; requireLimit in `accept` must
    // throw LIMIT_EXCEEDED. Before the fix, this inserted a sixth member.
    await expect(
      t
        .withIdentity(frankIdentity)
        .mutation(api.invitations.accept, { token: frankToken }),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });

    // Frank must not have become a member.
    const members = await t
      .withIdentity(aliceIdentity)
      .query(api.members.list, { orgSlug: "acme" });
    const frank = members.find((m) => m.email === "frank@example.com");
    expect(frank).toBeUndefined();
    // Sanity: exactly five active members now.
    const active = members.filter((m) => m.status === "active");
    expect(active.length).toBe(5);
  });
});

