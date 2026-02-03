import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/admin";
import { Card } from "@/components/ui/card";
import { Wine, Users, Building2, MessageSquare, TrendingUp, Eye, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Sake } from "@/lib/supabase-types";

interface Stats {
  totalSakes: number;
  totalUsers: number;
  totalBreweries: number;
  totalRatings: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [topSakes, setTopSakes] = useState<Sake[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch counts
        const [sakesRes, usersRes, ratingsRes] = await Promise.all([
          supabase.from('sake').select('*', { count: 'exact', head: true }),
          supabase.from('users').select('*', { count: 'exact', head: true }),
          supabase.from('ratings').select('*', { count: 'exact', head: true }),
        ]);

        // Get unique breweries count
        const { data: breweriesData } = await supabase
          .from('sake')
          .select('brewery');

        const uniqueBreweries = new Set(breweriesData?.map(s => s.brewery) || []);

        setStats({
          totalSakes: sakesRes.count || 0,
          totalUsers: usersRes.count || 0,
          totalBreweries: uniqueBreweries.size,
          totalRatings: ratingsRes.count || 0,
        });

        // Fetch top rated sakes
        const { data: topSakesData } = await supabase
          .from('sake')
          .select('*')
          .order('average_rating', { ascending: false, nullsFirst: false })
          .limit(5);

        setTopSakes(topSakesData || []);
        setConnected(true);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setConnected(false);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const statCards = [
    { label: "Total Sakes", value: stats?.totalSakes || 0, icon: Wine },
    { label: "Active Users", value: stats?.totalUsers || 0, icon: Users },
    { label: "Breweries", value: stats?.totalBreweries || 0, icon: Building2 },
    { label: "Reviews", value: stats?.totalRatings || 0, icon: MessageSquare },
  ];

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-serif font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here&apos;s what&apos;s happening with Sake Scan.</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin mt-2 text-muted-foreground" />
                  ) : (
                    <p className="text-2xl font-bold mt-1">{stat.value.toLocaleString()}</p>
                  )}
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top rated sakes */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Top Rated Sakes</h2>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : topSakes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No sakes found</p>
            ) : (
              <div className="space-y-4">
                {topSakes.map((sake, index) => (
                  <div key={sake.id} className="flex items-center gap-4">
                    <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}</span>
                    {sake.label_image_url ? (
                      <img src={sake.label_image_url} alt={sake.name} className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{sake.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{sake.brewery}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{sake.average_rating?.toFixed(1) || '-'}</p>
                      <p className="text-xs text-muted-foreground">{sake.total_ratings} reviews</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Quick actions */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Quick Actions</h2>
              <Eye className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-3">
              <Link to="/admin/sakes" className="block w-full p-4 text-left rounded-lg border border-border hover:border-primary/30 hover:bg-muted/50 transition-colors">
                <p className="font-medium">Add New Sake</p>
                <p className="text-sm text-muted-foreground">Add a new sake to the database</p>
              </Link>
              <Link to="/admin/sakes" className="block w-full p-4 text-left rounded-lg border border-border hover:border-primary/30 hover:bg-muted/50 transition-colors">
                <p className="font-medium">Manage Sake Database</p>
                <p className="text-sm text-muted-foreground">Edit, update, or remove sakes</p>
              </Link>
              <Link to="/admin/reviews" className="block w-full p-4 text-left rounded-lg border border-border hover:border-primary/30 hover:bg-muted/50 transition-colors">
                <p className="font-medium">Moderate Reviews</p>
                <p className="text-sm text-muted-foreground">View and moderate user reviews</p>
              </Link>
              <Link to="/admin/users" className="block w-full p-4 text-left rounded-lg border border-border hover:border-primary/30 hover:bg-muted/50 transition-colors">
                <p className="font-medium">Manage Users</p>
                <p className="text-sm text-muted-foreground">View user accounts and activity</p>
              </Link>
            </div>
          </Card>
        </div>

        {/* Connection status */}
        <Card className={`p-6 ${connected ? 'border-primary/30' : 'border-dashed border-2'}`}>
          <div className="text-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${connected ? 'bg-primary/10' : 'bg-muted'}`}>
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : connected ? (
                <CheckCircle2 className="w-6 h-6 text-primary" />
              ) : (
                <Wine className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <h3 className="font-semibold mb-2">
              {loading ? 'Connecting...' : connected ? 'Connected to Supabase' : 'Connection Failed'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {connected
                ? 'Your admin dashboard is connected to the Supabase backend.'
                : 'Unable to connect to Supabase. Check your configuration.'}
            </p>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
