import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { initialsOf } from "@/lib/imageMeta";
import { roleLabel } from "@/lib/roles";
import type { PersonProfile } from "@/hooks/usePersonTimeline";

/** Vem personen är: bild, namn, roll, butik, kontakt och instämplingsläge. */
export function PersonHeader({
  person,
  clockedInSince,
}: {
  person: PersonProfile;
  clockedInSince?: string | null;
}) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || "Namn saknas";
  const role = person.workplace || (person.primary_role ? roleLabel(person.primary_role) : null);

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-4">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-muted-foreground">
        {person.profile_image_url ? (
          <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          initialsOf(name)
        )}
      </span>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold leading-tight text-foreground">{name}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {role ? <span className="truncate">{role}</span> : null}
          {person.store_name ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {person.store_name}
            </span>
          ) : null}
          {person.phone ? (
            <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Phone className="h-3.5 w-3.5" />
              {person.phone}
            </a>
          ) : null}
          {person.email ? (
            <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Mail className="h-3.5 w-3.5" />
              {person.email}
            </a>
          ) : null}
        </p>
      </div>

      {clockedInSince ? (
        <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
          <Clock className="h-3.5 w-3.5" />
          Instämplad sedan{" "}
          {new Date(clockedInSince).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">Ej instämplad</Badge>
      )}
    </div>
  );
}

export default PersonHeader;
