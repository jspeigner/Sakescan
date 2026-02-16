import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, MoreHorizontal, Eye, Pencil, Star, Camera, MapPin, Mail, Calendar, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { User } from "@/lib/supabase-types";

interface UserWithStats extends User {
  reviewCount?: number;
  scanCount?: number;
  avgRating?: number | null;
}

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'active' | 'guest'>('all');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    display_name: "",
    email: "",
    location: "",
    avatar_url: "",
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.or(`display_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
      }

      if (filter === 'active') {
        query = query.eq('is_guest', false);
      } else if (filter === 'guest') {
        query = query.eq('is_guest', true);
      }

      // Get all matching for count, then paginate
      const { data: allUsers, error, count } = await query;

      if (error) throw error;

      // Get user IDs for stats
      const userIds = allUsers?.map(u => u.id) || [];

      // Fetch review counts and scan counts
      const [ratingsRes, scansRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('ratings').select('user_id, rating').in('user_id', userIds)
          : { data: [] },
        userIds.length > 0
          ? supabase.from('scans').select('user_id').in('user_id', userIds)
          : { data: [] }
      ]);

      // Aggregate stats
      const reviewStats = new Map<string, { count: number; total: number }>();
      const scanStats = new Map<string, number>();

      (ratingsRes.data || []).forEach(r => {
        const existing = reviewStats.get(r.user_id) || { count: 0, total: 0 };
        existing.count++;
        existing.total += r.rating;
        reviewStats.set(r.user_id, existing);
      });

      (scansRes.data || []).forEach(s => {
        scanStats.set(s.user_id, (scanStats.get(s.user_id) || 0) + 1);
      });

      // Enrich users with stats
      const enrichedUsers: UserWithStats[] = (allUsers || []).map(user => ({
        ...user,
        reviewCount: reviewStats.get(user.id)?.count || 0,
        scanCount: scanStats.get(user.id) || 0,
        avgRating: reviewStats.get(user.id)
          ? reviewStats.get(user.id)!.total / reviewStats.get(user.id)!.count
          : null,
      }));

      setTotalCount(count || 0);

      // Paginate
      const paginatedUsers = enrichedUsers.slice(
        page * PAGE_SIZE,
        (page + 1) * PAGE_SIZE
      );

      setUsers(paginatedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, filter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchUsers();
  };

  const handleViewUser = (user: UserWithStats) => {
    setSelectedUser(user);
    setEditMode(false);
    setEditForm({
      display_name: user.display_name || "",
      email: user.email || "",
      location: user.location || "",
      avatar_url: user.avatar_url || "",
    });
    setModalOpen(true);
  };

  const handleEditUser = (user: UserWithStats) => {
    setSelectedUser(user);
    setEditMode(true);
    setEditForm({
      display_name: user.display_name || "",
      email: user.email || "",
      location: user.location || "",
      avatar_url: user.avatar_url || "",
    });
    setModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          display_name: editForm.display_name || null,
          email: editForm.email || null,
          location: editForm.location || null,
          avatar_url: editForm.avatar_url || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      setModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (user: UserWithStats) => {
    if (!confirm(`Are you sure you want to delete ${user.display_name || user.email || 'this user'}? This will also delete all their reviews and scans. This cannot be undone.`)) {
      return;
    }

    try {
      // Delete user's ratings first (foreign key constraint)
      await supabase.from('ratings').delete().eq('user_id', user.id);
      
      // Delete user's scans
      await supabase.from('scans').delete().eq('user_id', user.id);
      
      // Delete user
      const { error } = await supabase.from('users').delete().eq('id', user.id);

      if (error) throw error;

      if (selectedUser?.id === user.id) {
        setModalOpen(false);
        setSelectedUser(null);
      }

      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  const handleViewUserReviews = (userId: string) => {
    // Navigate to reviews filtered by user
    navigate(`/admin/reviews?user=${userId}`);
  };

  const getInitials = (user: User) => {
    if (user.display_name) {
      return user.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold">Users</h1>
            <p className="text-muted-foreground">Manage user accounts ({totalCount} total)</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => { setFilter(v as typeof filter); setPage(0); }}>
          <TabsList>
            <TabsTrigger value="all">All Users</TabsTrigger>
            <TabsTrigger value="active">Registered</TabsTrigger>
            <TabsTrigger value="guest">Guests</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <Card className="p-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </Card>

        {/* Table */}
        <Card>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No users found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden md:table-cell">Location</TableHead>
                  <TableHead className="hidden lg:table-cell">Reviews</TableHead>
                  <TableHead className="hidden lg:table-cell">Scans</TableHead>
                  <TableHead className="hidden sm:table-cell">Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewUser(user)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          {user.avatar_url ? <AvatarImage src={user.avatar_url} /> : null}
                          <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{user.display_name || 'Anonymous'}</p>
                          <p className="text-sm text-muted-foreground truncate hidden sm:block">
                            {user.email || 'No email'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {user.location ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          {user.location}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-muted-foreground" />
                        {user.reviewCount || 0}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                        {user.scanCount || 0}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_guest ? "secondary" : "default"}>
                        {user.is_guest ? 'guest' : 'active'}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewUser(user)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditUser(user)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit User
                          </DropdownMenuItem>
                          {(user.reviewCount ?? 0) > 0 && (
                            <DropdownMenuItem onClick={() => handleViewUserReviews(user.id)}>
                              <Star className="w-4 h-4 mr-2" />
                              View Reviews ({user.reviewCount})
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleDeleteUser(user)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {users.length > 0 ? page * PAGE_SIZE + 1 : 0} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} users
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* View/Edit User Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Edit User' : 'User Details'}</DialogTitle>
            <DialogDescription>
              {selectedUser?.display_name || selectedUser?.email || 'User information'}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              {/* Avatar and basic info */}
              {!editMode && (
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <Avatar className="w-16 h-16">
                    {selectedUser.avatar_url ? <AvatarImage src={selectedUser.avatar_url} /> : null}
                    <AvatarFallback className="text-lg">{getInitials(selectedUser)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-lg font-medium">{selectedUser.display_name || 'Anonymous'}</p>
                    <p className="text-sm text-muted-foreground">{selectedUser.email || 'No email'}</p>
                    <Badge className="mt-1" variant={selectedUser.is_guest ? "secondary" : "default"}>
                      {selectedUser.is_guest ? 'Guest Account' : 'Registered User'}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Stats */}
              {!editMode && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <p className="text-2xl font-bold">{selectedUser.reviewCount || 0}</p>
                    <p className="text-xs text-muted-foreground">Reviews</p>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <p className="text-2xl font-bold">{selectedUser.scanCount || 0}</p>
                    <p className="text-xs text-muted-foreground">Scans</p>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <p className="text-2xl font-bold">
                      {selectedUser.avgRating ? selectedUser.avgRating.toFixed(1) : '-'}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg Rating</p>
                  </div>
                </div>
              )}

              {/* Info fields */}
              {editMode ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display Name</Label>
                    <Input
                      id="display_name"
                      value={editForm.display_name}
                      onChange={(e) => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                      placeholder="User's display name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="user@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={editForm.location}
                      onChange={(e) => setEditForm(f => ({ ...f, location: e.target.value }))}
                      placeholder="City, Country"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="avatar_url">Avatar URL</Label>
                    <Input
                      id="avatar_url"
                      value={editForm.avatar_url}
                      onChange={(e) => setEditForm(f => ({ ...f, avatar_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedUser.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedUser.location}</span>
                    </div>
                  )}
                  {selectedUser.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedUser.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>Joined {formatFullDate(selectedUser.created_at)}</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteUser(selectedUser)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
                <div className="flex gap-2">
                  {editMode ? (
                    <>
                      <Button variant="outline" onClick={() => setEditMode(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveEdit} disabled={saving}>
                        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Save Changes
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setModalOpen(false)}>
                        Close
                      </Button>
                      <Button onClick={() => setEditMode(true)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
