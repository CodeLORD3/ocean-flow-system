import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

export default function StaffForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) setError("Kunde inte skicka återställningslänk. Försök igen.");
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="p-6">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-lg font-semibold text-foreground mb-2">Kolla din e-post</h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Vi har skickat en länk för att återställa lösenordet till <strong>{email}</strong>.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold mb-1 text-foreground">Glömt lösenord</h1>
              <p className="text-xs text-muted-foreground mb-5">
                Ange din arbets-e-post och vi skickar en länk för att skapa ett nytt lösenord.
              </p>

              {error && (
                <div className="mb-4 p-2.5 bg-destructive/10 border border-destructive/20 rounded text-destructive text-xs">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">E-post</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Skicka återställningslänk"}
                </Button>
              </form>
            </>
          )}

          <div className="mt-5 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Tillbaka till inloggning
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
