import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Phone, MapPin, Clock, Info, Send, CheckCircle } from "lucide-react";

export default function PortalContact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

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

      {/* Contact Form */}
      <div className="border border-border bg-white p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Send us a message</h2>
        <p className="text-xs text-muted-foreground mb-4">We'll get back to you as soon as possible.</p>

        {sent ? (
          <div className="flex items-center gap-3 p-4 bg-mackerel-light border border-mackerel/30">
            <CheckCircle className="h-5 w-5 text-mackerel shrink-0" />
            <div>
              <div className="text-sm font-semibold text-mackerel">Message sent!</div>
              <div className="text-xs text-mackerel">We've received your message and will reply within 1 business day.</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Name</label>
              <input
                type="text" required value={name} onChange={e => setName(e.target.value)}
                className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Email</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Message</label>
              <textarea
                required value={message} onChange={e => setMessage(e.target.value)} rows={4}
                className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              />
            </div>
            <button
              type="submit"
              className="h-9 px-5 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" /> Send Message
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
