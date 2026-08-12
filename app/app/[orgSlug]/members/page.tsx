"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const members = useQuery(api.members.list, { orgSlug });
  const roles = useQuery(api.roles.list, {});
  const invite = useMutation(api.invitations.create);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Viewer");
  const [inviting, setInviting] = useState(false);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Members</h1>
      <div className="flex gap-2">
        <Input placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select value={role} onValueChange={(v) => setRole(v ?? "Viewer")}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {roles?.map((r) => <SelectItem key={r._id} value={r.name}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          disabled={inviting}
          onClick={async () => {
            setInviting(true);
            try {
              await invite({ orgSlug, email, roleName: role });
              setEmail("");
              toast.success("Invitation sent");
            } catch (err: unknown) {
              const code = (err as { data?: { code?: string } })?.data?.code;
              if (code === "LIMIT_EXCEEDED") {
                toast.error("Member limit reached — upgrade your plan.");
              } else if (code === "CONFLICT") {
                toast.error("An invitation is already pending for that email.");
              } else if (code === "VALIDATION_ERROR") {
                toast.error("Please enter a valid email address.");
              } else {
                toast.error("Could not send invitation.");
              }
            } finally {
              setInviting(false);
            }
          }}
        >
          Invite
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th></tr>
        </thead>
        <tbody>
          {members?.map((m) => (
            <tr key={m.membershipId} className="border-t">
              <td className="py-2">{m.name}</td>
              <td>{m.email}</td>
              <td>{m.roleName}</td>
              <td>{m.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
