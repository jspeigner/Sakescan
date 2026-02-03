import { AdminLayout } from "@/components/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Database, Bell, Shield, Globe } from "lucide-react";

export default function AdminSettings() {
  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-serif font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your admin preferences and integrations</p>
        </div>

        {/* Supabase Connection */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold mb-1">Supabase Connection</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Connect to your Supabase backend for real-time data management
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="supabase-url">Supabase URL</Label>
                  <Input
                    id="supabase-url"
                    placeholder="https://your-project.supabase.co"
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supabase-key">Anon Key</Label>
                  <Input
                    id="supabase-key"
                    type="password"
                    placeholder="Enter your Supabase anon key"
                    disabled
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the ENV tab
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold mb-1">Notifications</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Configure admin notification preferences
              </p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">New user signups</p>
                    <p className="text-xs text-muted-foreground">Get notified when new users join</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Flagged reviews</p>
                    <p className="text-xs text-muted-foreground">Get notified about flagged content</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">New sake submissions</p>
                    <p className="text-xs text-muted-foreground">Get notified about user submissions</p>
                  </div>
                  <Switch />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Security */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold mb-1">Security</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Manage security settings
              </p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Two-factor authentication</p>
                    <p className="text-xs text-muted-foreground">Add an extra layer of security</p>
                  </div>
                  <Switch />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Session timeout</p>
                    <p className="text-xs text-muted-foreground">Auto-logout after inactivity</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* General */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold mb-1">General</h2>
              <p className="text-sm text-muted-foreground mb-4">
                General application settings
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="app-name">Application Name</Label>
                  <Input id="app-name" defaultValue="Sake Scan" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <Input id="domain" defaultValue="sakescan.com" disabled />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Save button */}
        <div className="flex justify-end">
          <Button>Save Changes</Button>
        </div>
      </div>
    </AdminLayout>
  );
}
