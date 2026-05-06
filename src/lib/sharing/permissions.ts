import type { MyRole, SchemaRecord } from "@/lib/storage/types";

export interface Permission {
  /** True if the viewer can write changes (DBML or position). */
  canEdit: boolean;
  /** True if the viewer is the creator/owner. */
  isOwner: boolean;
  /** Concrete role label, useful for badges in the UI. */
  role: MyRole;
  /** True for visitors who arrived via a public share link without signing in. */
  isAnonymousViewer: boolean;
}

/**
 * Derive permissions purely from the loaded schema record. Local schemas have
 * no `myRole` (they're inherently single-user), so they're always editable.
 */
export function permissionFor(rec: SchemaRecord | null): Permission {
  if (!rec) {
    return { canEdit: false, isOwner: false, role: null, isAnonymousViewer: false };
  }
  // Local schemas: full edit, no sharing concept.
  if (rec.myRole === undefined || rec.myRole === null) {
    return { canEdit: true, isOwner: true, role: null, isAnonymousViewer: false };
  }
  const role = rec.myRole;
  const canEdit =
    role === "owner" || role === "editor" || role === "public-editor";
  const isOwner = role === "owner";
  const isAnonymousViewer =
    role === "public-viewer" || role === "public-editor";
  return { canEdit, isOwner, role, isAnonymousViewer };
}
