import { supabase } from "@/lib/supabase/client";
import type { CollaboratorRole, PublicRole } from "@/lib/storage/types";

export interface CollaboratorRow {
  userId: string;
  role: CollaboratorRole;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
  addedAt: number;
}

export interface InviteRow {
  id: string;
  email: string;
  role: "viewer" | "editor";
  token: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
}

function ensure() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function setPublicRole(
  schemaId: string,
  role: PublicRole,
): Promise<void> {
  const sb = ensure();
  const { error } = await sb
    .from("schemas")
    .update({ public_role: role })
    .eq("id", schemaId);
  if (error) throw error;
}

export async function listCollaborators(
  schemaId: string,
): Promise<CollaboratorRow[]> {
  const sb = ensure();
  const { data, error } = await sb
    .from("schema_collaborators")
    .select("user_id, role, email, display_name, added_at")
    .eq("schema_id", schemaId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id as string,
    role: r.role as CollaboratorRole,
    email: (r.email as string | null) ?? undefined,
    fullName: (r.display_name as string | null) ?? undefined,
    addedAt: new Date(r.added_at as string).getTime(),
  }));
}

export async function removeCollaborator(
  schemaId: string,
  userId: string,
): Promise<void> {
  const sb = ensure();
  const { error } = await sb
    .from("schema_collaborators")
    .delete()
    .eq("schema_id", schemaId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function changeCollaboratorRole(
  schemaId: string,
  userId: string,
  role: CollaboratorRole,
): Promise<void> {
  const sb = ensure();
  const { error } = await sb
    .from("schema_collaborators")
    .update({ role })
    .eq("schema_id", schemaId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function listInvites(schemaId: string): Promise<InviteRow[]> {
  const sb = ensure();
  const { data, error } = await sb
    .from("schema_invites")
    .select("id, email, role, token, created_at, expires_at, accepted_at")
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    email: r.email as string,
    role: r.role as "viewer" | "editor",
    token: r.token as string,
    createdAt: new Date(r.created_at as string).getTime(),
    expiresAt: new Date(r.expires_at as string).getTime(),
    acceptedAt: r.accepted_at
      ? new Date(r.accepted_at as string).getTime()
      : null,
  }));
}

export async function createInvite(
  schemaId: string,
  email: string,
  role: "viewer" | "editor",
): Promise<InviteRow> {
  const sb = ensure();
  const { data: userRes, error: userErr } = await sb.auth.getUser();
  if (userErr || !userRes.user) throw new Error("You're not signed in.");
  const { data, error } = await sb
    .from("schema_invites")
    .insert({
      schema_id: schemaId,
      email: email.trim().toLowerCase(),
      role,
      created_by: userRes.user.id,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    email: data.email as string,
    role: data.role as "viewer" | "editor",
    token: data.token as string,
    createdAt: new Date(data.created_at as string).getTime(),
    expiresAt: new Date(data.expires_at as string).getTime(),
    acceptedAt: null,
  };
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const sb = ensure();
  const { error } = await sb.from("schema_invites").delete().eq("id", inviteId);
  if (error) throw error;
}

export async function acceptInvite(token: string): Promise<string> {
  const sb = ensure();
  const { data, error } = await sb.rpc("accept_invite", {
    invite_token: token,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Unexpected RPC response");
  return data;
}

/**
 * Build a copyable URL the owner can share to grant access via an invite.
 * The recipient signs in (or up) at /invite/:token, which redirects to
 * /s/:schemaId once the RPC accepts.
 */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

/**
 * Build a public-link URL for a schema (only useful when public_role != 'none').
 */
export function publicShareUrl(schemaId: string): string {
  return `${window.location.origin}/s/${schemaId}`;
}
