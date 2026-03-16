import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IOS_APP_STORE_URL } from "@/lib/app-links";
import { Smartphone } from "lucide-react";

export default function AuthCallback() {
  const location = useLocation();
  const [status, setStatus] = useState<"redirecting" | "open-app" | "expired">("redirecting");

  useEffect(() => {
    const hash = location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (accessToken && refreshToken) {
      const appUrl = `vibecode://reset-password#${hash}`;

      if (isMobile) {
        window.location.href = appUrl;
      } else {
        setStatus("open-app");
        // Store the link for the button
        (window as unknown as { __authCallbackUrl?: string }).__authCallbackUrl = appUrl;
      }
    } else {
      setStatus("expired");
    }
  }, [location.hash]);

  const handleOpenApp = () => {
    const url = (window as unknown as { __authCallbackUrl?: string }).__authCallbackUrl;
    if (url) window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Complete Setup"
        description="Open the SakeScan app to complete your password reset or sign in."
        path="/auth/callback"
      />
      <Header />
      <main className="pt-24 pb-16">
        <div className="max-w-md mx-auto px-6">
          <Card className="p-8 text-center">
            {status === "redirecting" && (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 animate-pulse">
                  <Smartphone className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-2xl font-serif font-bold mb-2">Opening SakeScan...</h1>
                <p className="text-muted-foreground">
                  Redirecting to the app. If it doesn't open automatically, you may be on a desktop—check your phone for the reset link.
                </p>
              </>
            )}

            {status === "open-app" && (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <Smartphone className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-2xl font-serif font-bold mb-2">Almost there</h1>
                <p className="text-muted-foreground mb-6">
                  Open the SakeScan app on your phone to complete your password reset. Or click the
                  button below if the app is on this device.
                </p>
                <Button onClick={handleOpenApp} size="lg" className="w-full">
                  Open SakeScan App
                </Button>
                <p className="text-sm text-muted-foreground mt-6">
                  Don't have the app?{" "}
                  <a href={IOS_APP_STORE_URL} className="text-primary hover:underline">
                    Download for iOS
                  </a>
                </p>
              </>
            )}

            {status === "expired" && (
              <>
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                  <Smartphone className="w-8 h-8 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-serif font-bold mb-2">Link expired</h1>
                <p className="text-muted-foreground mb-6">
                  This link has expired or was already used. Please request a new password reset from
                  the SakeScan app.
                </p>
                <a href={IOS_APP_STORE_URL}>
                  <Button variant="outline" size="lg">
                    Open SakeScan
                  </Button>
                </a>
              </>
            )}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
