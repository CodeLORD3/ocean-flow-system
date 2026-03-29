import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Phone, MapPin, Clock, Info } from "lucide-react";

export default function PortalContact() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ["contact-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-base font-bold text-foreground">Contact & Support</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Get in touch with our team</p>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse py-8 text-center">Loading...</div>
      ) : settings ? (
        <div className="space-y-3">
          {settings.email && (
            <div className="border border-border bg-white p-4 flex items-start gap-3">
              <div className="h-8 w-8 bg-primary/10 flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Email</div>
                <a href={`mailto:${settings.email}`} className="text-xs text-primary hover:underline">
                  {settings.email}
                </a>
              </div>
            </div>
          )}

          {settings.phone && (
            <div className="border border-border bg-white p-4 flex items-start gap-3">
              <div className="h-8 w-8 bg-primary/10 flex items-center justify-center shrink-0">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Phone</div>
                <a href={`tel:${settings.phone}`} className="text-xs text-primary hover:underline">
                  {settings.phone}
                </a>
              </div>
            </div>
          )}

          {settings.address && (
            <div className="border border-border bg-white p-4 flex items-start gap-3">
              <div className="h-8 w-8 bg-primary/10 flex items-center justify-center shrink-0">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Address</div>
                <div className="text-xs text-muted-foreground">{settings.address}</div>
              </div>
            </div>
          )}

          {settings.opening_hours && (
            <div className="border border-border bg-white p-4 flex items-start gap-3">
              <div className="h-8 w-8 bg-primary/10 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Opening Hours</div>
                <div className="text-xs text-muted-foreground whitespace-pre-line">{settings.opening_hours}</div>
              </div>
            </div>
          )}

          {settings.additional_info && (
            <div className="border border-border bg-white p-4 flex items-start gap-3">
              <div className="h-8 w-8 bg-primary/10 flex items-center justify-center shrink-0">
                <Info className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Additional Information</div>
                <div className="text-xs text-muted-foreground whitespace-pre-line">{settings.additional_info}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-border bg-white p-8 text-center text-xs text-muted-foreground">
          Contact information is not available yet.
        </div>
      )}
    </div>
  );
}
