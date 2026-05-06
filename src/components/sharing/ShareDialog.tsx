import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Globe,
  Link2,
  Loader2,
  Mail,
  Shield,
  ShieldCheck,
  Trash2,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  changeCollaboratorRole,
  createInvite,
  inviteUrl,
  listCollaborators,
  listInvites,
  publicShareUrl,
  removeCollaborator,
  revokeInvite,
  setPublicRole,
  type CollaboratorRow,
  type InviteRow,
} from "@/lib/sharing/queries";
import type {
  CollaboratorRole,
  PublicRole,
  SchemaRecord,
} from "@/lib/storage/types";
import { cn, formatError, formatRelativeTime, stringToHue } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  schema: SchemaRecord;
  onSchemaUpdated: (next: SchemaRecord) => void;
}

const PUBLIC_OPTIONS: {
  value: PublicRole;
  label: string;
  hint: string;
  icon: typeof Globe;
}[] = [
  { value: "none", label: "Off", hint: "Only people you invite", icon: Shield },
  {
    value: "viewer",
    label: "View only",
    hint: "Anyone with link can view",
    icon: ShieldCheck,
  },
  {
    value: "editor",
    label: "Can edit",
    hint: "Anyone with link can edit",
    icon: Globe,
  },
];

export function ShareDialog({ open, onClose, schema, onSchemaUpdated }: Props) {
  const [publicRole, setPublicRoleState] = useState<PublicRole>(
    schema.publicRole ?? "none",
  );
  const [updatingPublic, setUpdatingPublic] = useState(false);
  const [collabs, setCollabs] = useState<CollaboratorRow[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([
        listCollaborators(schema.id),
        listInvites(schema.id),
      ]);
      setCollabs(c);
      setInvites(i);
    } catch (e) {
      toast.error("Couldn't load collaborators", { description: formatError(e) });
    }
  }, [schema.id]);

  useEffect(() => {
    if (!open) return;
    setPublicRoleState(schema.publicRole ?? "none");
    void refresh();
  }, [open, schema.publicRole, refresh]);

  async function setPublic(role: PublicRole) {
    if (role === publicRole) return;
    setPublicRoleState(role);
    setUpdatingPublic(true);
    try {
      await setPublicRole(schema.id, role);
      onSchemaUpdated({ ...schema, publicRole: role });
      toast.success(
        role === "none"
          ? "Public access turned off"
          : `Anyone with the link can ${role === "editor" ? "edit" : "view"}`,
      );
    } catch (e) {
      // Roll back the optimistic state.
      setPublicRoleState(schema.publicRole ?? "none");
      toast.error("Couldn't update public access", { description: formatError(e) });
    } finally {
      setUpdatingPublic(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Share schema</DialogTitle>
          <DialogDescription>
            Control who can view or edit{" "}
            <span className="font-medium text-foreground">{schema.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <PublicLinkSection
          schemaId={schema.id}
          publicRole={publicRole}
          updating={updatingPublic}
          onChange={setPublic}
        />

        <Separator />

        <InviteForm schemaId={schema.id} onCreated={refresh} />

        <PendingInvites
          invites={invites}
          onChanged={refresh}
        />

        <CollaboratorsList
          collabs={collabs}
          onChanged={refresh}
          schemaId={schema.id}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function PublicLinkSection({
  schemaId,
  publicRole,
  updating,
  onChange,
}: {
  schemaId: string;
  publicRole: PublicRole;
  updating: boolean;
  onChange: (role: PublicRole) => void;
}) {
  const url = publicShareUrl(schemaId);
  const isOn = publicRole !== "none";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Public link</h3>
        {updating && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-surface-2 p-1">
        {PUBLIC_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              "flex flex-col items-start gap-1 rounded px-3 py-2 text-left text-xs transition-colors",
              publicRole === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              <Icon className="size-3.5" />
              {label}
            </span>
            <span className="text-[10.5px] leading-tight opacity-80">{hint}</span>
          </button>
        ))}
      </div>
      {isOn && <CopyableUrl value={url} label="Share link" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function InviteForm({
  schemaId,
  onCreated,
}: {
  schemaId: string;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("editor");
  const [busy, setBusy] = useState(false);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const inv = await createInvite(schemaId, email.trim(), role);
      const url = inviteUrl(inv.token);
      setLatestUrl(url);
      setEmail("");
      onCreated();
      try {
        await navigator.clipboard?.writeText(url);
        toast.success("Invite link copied to clipboard");
      } catch {
        toast.success("Invite created", { description: "Copy the link below." });
      }
    } catch (e) {
      toast.error("Couldn't create invite", { description: formatError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Invite by email</h3>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="invite-email" className="sr-only">
            Email
          </Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="teammate@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as "viewer" | "editor")}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Invite"}
        </Button>
      </div>
      {latestUrl && (
        <CopyableUrl
          value={latestUrl}
          label="Send this link to the invitee"
          subtle
        />
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
function PendingInvites({
  invites,
  onChanged,
}: {
  invites: InviteRow[] | null;
  onChanged: () => void;
}) {
  if (!invites) return null;
  const pending = invites.filter((i) => !i.acceptedAt);
  if (pending.length === 0) return null;

  async function revoke(id: string) {
    try {
      await revokeInvite(id);
      onChanged();
      toast.success("Invite revoked");
    } catch (e) {
      toast.error("Couldn't revoke invite", { description: formatError(e) });
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Pending invites
      </h4>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface">
        {pending.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center gap-2 px-3 py-2 text-sm"
          >
            <UserCircle className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate">{inv.email}</div>
              <div className="text-[11px] text-muted-foreground">
                {inv.role === "editor" ? "Editor" : "Viewer"} · expires{" "}
                {formatRelativeTime(inv.expiresAt)}
              </div>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Copy invite link"
              onClick={async () => {
                try {
                  await navigator.clipboard?.writeText(inviteUrl(inv.token));
                  toast.success("Copied");
                } catch {
                  toast.error("Couldn't copy to clipboard");
                }
              }}
            >
              <Copy />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Revoke invite"
              onClick={() => revoke(inv.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CollaboratorsList({
  collabs,
  onChanged,
  schemaId,
}: {
  collabs: CollaboratorRow[] | null;
  onChanged: () => void;
  schemaId: string;
}) {
  if (!collabs) return null;
  if (collabs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        People with access
      </h4>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface">
        {collabs.map((c) => (
          <CollaboratorRow
            key={c.userId}
            collab={c}
            schemaId={schemaId}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </div>
  );
}

function CollaboratorRow({
  collab,
  schemaId,
  onChanged,
}: {
  collab: CollaboratorRow;
  schemaId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const display = collab.fullName || collab.email || "Unknown";
  const subtitle = collab.email && collab.email !== display ? collab.email : "";
  const hue = stringToHue(collab.email || collab.userId);

  async function setRole(role: CollaboratorRole) {
    setBusy(true);
    try {
      await changeCollaboratorRole(schemaId, collab.userId, role);
      toast.success("Role updated");
      onChanged();
    } catch (e) {
      toast.error("Couldn't update role", { description: formatError(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeCollaborator(schemaId, collab.userId);
      toast.success("Removed");
      onChanged();
    } catch (e) {
      toast.error("Couldn't remove", { description: formatError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <span
        className="grid size-7 place-items-center rounded-full text-[11px] font-semibold text-white"
        style={{ background: `oklch(0.62 0.16 ${hue})` }}
      >
        {(display[0] ?? "?").toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate">{display}</div>
        {subtitle && (
          <div className="truncate text-[11px] text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      <Select
        value={collab.role}
        onValueChange={(v) => setRole(v as CollaboratorRole)}
        disabled={busy || collab.role === "owner"}
      >
        <SelectTrigger className="w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="viewer">Viewer</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
        </SelectContent>
      </Select>
      {collab.role !== "owner" && (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={remove}
          disabled={busy}
          aria-label="Remove access"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
function CopyableUrl({
  value,
  label,
  subtle = false,
}: {
  value: string;
  label?: string;
  subtle?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <div className={cn("space-y-1", subtle && "opacity-90")}>
      {label && (
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
      )}
      <div className="flex gap-2">
        <Input value={value} readOnly className="font-mono text-[12px]" />
        <Button
          type="button"
          size="default"
          variant="outline"
          onClick={copy}
          className="shrink-0"
        >
          {copied ? (
            <>
              <Check /> Copied
            </>
          ) : (
            <>
              <Copy /> Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
