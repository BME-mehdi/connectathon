type Member = { id: string; full_name: string; relation: string; is_minor: boolean };

export const RELATION_LABEL: Record<string, string> = {
  spouse: "Conjoint·e",
  parent: "Parent",
  child: "Enfant",
  sibling: "Frère / sœur",
  other: "Autre",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Node({
  name,
  sublabel,
  highlight,
}: {
  name: string;
  sublabel: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex w-20 flex-col items-center gap-1.5 shrink-0">
      <div
        className={`flex size-12 items-center justify-center rounded-full text-sm font-heading font-bold ${
          highlight
            ? "bg-hero-gradient text-white"
            : "bg-secondary text-primary border border-border"
        }`}
      >
        {initials(name)}
      </div>
      <p className="w-full truncate text-center text-xs font-medium text-foreground leading-tight">
        {name}
      </p>
      <p className="text-center text-[10px] text-muted-foreground leading-tight">
        {sublabel}
      </p>
    </div>
  );
}

function Connector() {
  return <div className="h-5 w-px bg-border" />;
}

export function FamilyTree({
  ownerName,
  members,
}: {
  ownerName: string;
  members: Member[];
}) {
  const parents = members.filter((m) => m.relation === "parent");
  const peers = members.filter((m) => m.relation === "spouse" || m.relation === "sibling");
  const children = members.filter((m) => m.relation === "child");
  const other = members.filter(
    (m) => !["self", "parent", "spouse", "sibling", "child"].includes(m.relation)
  );

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max flex-col items-center py-2">
        {parents.length > 0 && (
          <>
            <div className="flex gap-6">
              {parents.map((p) => (
                <Node key={p.id} name={p.full_name} sublabel={RELATION_LABEL[p.relation]} />
              ))}
            </div>
            <Connector />
          </>
        )}

        <div className="flex items-start gap-6">
          <Node name={ownerName} sublabel="Vous" highlight />
          {peers.map((p) => (
            <Node key={p.id} name={p.full_name} sublabel={RELATION_LABEL[p.relation]} />
          ))}
        </div>

        {children.length > 0 && (
          <>
            <Connector />
            <div className="flex gap-6">
              {children.map((c) => (
                <Node
                  key={c.id}
                  name={c.full_name}
                  sublabel={c.is_minor ? "Enfant · mineur" : RELATION_LABEL[c.relation]}
                />
              ))}
            </div>
          </>
        )}

        {other.length > 0 && (
          <div className="mt-4 flex gap-6 border-t border-dashed border-border pt-4">
            {other.map((o) => (
              <Node key={o.id} name={o.full_name} sublabel="Autre" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
