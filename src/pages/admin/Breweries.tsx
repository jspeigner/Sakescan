import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  MoreHorizontal,
  MapPin,
  Loader2,
  Pencil,
  Eye,
  ExternalLink,
  Globe,
  Phone,
  Mail,
  Calendar,
  Wine,
  Building2,
  Download,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Brewery } from "@/lib/supabase-types";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";

const PAGE_SIZE = 20;

export default function AdminBreweries() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [breweries, setBreweries] = useState<Brewery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [tableExists, setTableExists] = useState(true);

  // View/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBrewery, setSelectedBrewery] = useState<Brewery | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    prefecture: "",
    region: "",
    address: "",
    phone: "",
    website: "",
    email: "",
    founded_year: "",
    description: "",
  });

  const fetchBreweries = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('breweries')
        .select('*', { count: 'exact' })
        .order('name', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,prefecture.ilike.%${searchQuery}%,region.ilike.%${searchQuery}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        if (error.message.includes('does not exist')) {
          setTableExists(false);
          setLoading(false);
          return;
        }
        throw error;
      }

      setBreweries(data || []);
      setTotalCount(count || 0);
      setTableExists(true);
    } catch (error) {
      console.error('Error fetching breweries:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => {
    fetchBreweries();
  }, [fetchBreweries]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchBreweries();
  };

  const handleViewBrewery = (brewery: Brewery) => {
    setSelectedBrewery(brewery);
    setEditMode(false);
    setEditForm({
      name: brewery.name,
      prefecture: brewery.prefecture || "",
      region: brewery.region || "",
      address: brewery.address || "",
      phone: brewery.phone || "",
      website: brewery.website || "",
      email: brewery.email || "",
      founded_year: brewery.founded_year?.toString() || "",
      description: brewery.description || "",
    });
    setModalOpen(true);
  };

  const handleEditBrewery = (brewery: Brewery) => {
    setSelectedBrewery(brewery);
    setEditMode(true);
    setEditForm({
      name: brewery.name,
      prefecture: brewery.prefecture || "",
      region: brewery.region || "",
      address: brewery.address || "",
      phone: brewery.phone || "",
      website: brewery.website || "",
      email: brewery.email || "",
      founded_year: brewery.founded_year?.toString() || "",
      description: brewery.description || "",
    });
    setModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedBrewery) return;
    setSaving(true);
    try {
      const token = session?.access_token;
      if (!token) {
        throw new Error("Admin session expired. Sign in again and retry save.");
      }

      const payload = {
          name: editForm.name,
          prefecture: editForm.prefecture || null,
          region: editForm.region || null,
          address: editForm.address || null,
          phone: editForm.phone || null,
          website: editForm.website || null,
          email: editForm.email || null,
          founded_year: editForm.founded_year ? parseInt(editForm.founded_year) : null,
          description: editForm.description || null,
          updated_at: new Date().toISOString(),
        };

      const response = await fetch('/api/admin-update-brewery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: selectedBrewery.id, payload }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Save failed (${response.status})`);
      }
      setModalOpen(false);
      fetchBreweries();
    } catch (error) {
      console.error('Error saving brewery:', error);
      const message = error instanceof Error ? error.message : 'Failed to save changes';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // If table doesn't exist, show prompt to import
  if (!loading && !tableExists) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-serif font-bold">Breweries</h1>
            <p className="text-muted-foreground">Manage sake breweries</p>
          </div>
          <Card className="p-8 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
              <h2 className="text-xl font-semibold">No Breweries Table Yet</h2>
              <p className="text-muted-foreground">
                Import brewery data to get started. The import tool will set up the database table and populate it with data.
              </p>
              <Link to="/admin/import">
                <Button className="gap-2">
                  <Download className="w-4 h-4" />
                  Go to Import
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold">Breweries</h1>
            <p className="text-muted-foreground">{totalCount} breweries in database</p>
          </div>
          <Link to="/admin/import">
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Import More
            </Button>
          </Link>
        </div>

        {/* Search */}
        <Card className="p-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, prefecture, or region..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </Card>

        {/* Table */}
        <Card>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : breweries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No breweries found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brewery</TableHead>
                  <TableHead className="hidden sm:table-cell">Prefecture</TableHead>
                  <TableHead className="hidden md:table-cell">Founded</TableHead>
                  <TableHead className="hidden lg:table-cell">Brands</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breweries.map((brewery) => (
                  <TableRow
                    key={brewery.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleEditBrewery(brewery)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 rounded-md">
                          {brewery.image_url ? (
                            <AvatarImage src={brewery.image_url} className="object-cover" />
                          ) : null}
                          <AvatarFallback className="rounded-md text-xs bg-muted">
                            {brewery.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{brewery.name}</p>
                          {brewery.region && (
                            <p className="text-sm text-muted-foreground">{brewery.region}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {brewery.prefecture ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          {brewery.prefecture}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {brewery.founded_year ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          {brewery.founded_year}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {Array.isArray(brewery.brands) && brewery.brands.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {brewery.brands.slice(0, 2).map((brand, j) => (
                            <Badge key={j} variant="secondary" className="text-xs">{brand}</Badge>
                          ))}
                          {brewery.brands.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{brewery.brands.length - 2}</Badge>
                          )}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewBrewery(brewery)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditBrewery(brewery)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/admin/sakes?brewery=${encodeURIComponent(brewery.name)}`)}>
                            <Wine className="w-4 h-4 mr-2" />
                            View Sakes
                          </DropdownMenuItem>
                          {brewery.website && (
                            <DropdownMenuItem onClick={() => window.open(brewery.website!, '_blank')}>
                              <Globe className="w-4 h-4 mr-2" />
                              Visit Website
                            </DropdownMenuItem>
                          )}
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
            Showing {breweries.length > 0 ? page * PAGE_SIZE + 1 : 0} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Brewery Detail / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Edit Brewery' : 'Brewery Details'}</DialogTitle>
            <DialogDescription>{selectedBrewery?.name}</DialogDescription>
          </DialogHeader>

          {selectedBrewery && !editMode && (
            <div className="space-y-5">
              {/* Image + Basic Info */}
              <div className="flex gap-4">
                {selectedBrewery.image_url && (
                  <img
                    src={selectedBrewery.image_url}
                    alt={selectedBrewery.name}
                    className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">{selectedBrewery.name}</h3>
                  {selectedBrewery.prefecture && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {selectedBrewery.prefecture}, {selectedBrewery.region}
                    </div>
                  )}
                  {selectedBrewery.founded_year && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      Founded {selectedBrewery.founded_year}
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {selectedBrewery.description && (
                <div>
                  <Label className="text-muted-foreground text-xs uppercase">Description</Label>
                  <p className="text-sm mt-1 leading-relaxed">{selectedBrewery.description}</p>
                </div>
              )}

              {/* Brands */}
              {Array.isArray(selectedBrewery.brands) && selectedBrewery.brands.length > 0 && (
                <div>
                  <Label className="text-muted-foreground text-xs uppercase">Sake Brands</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedBrewery.brands.map((brand, i) => (
                      <Badge key={i} variant="secondary">{brand}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedBrewery.address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <span>{selectedBrewery.address}</span>
                  </div>
                )}
                {selectedBrewery.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedBrewery.phone}</span>
                  </div>
                )}
                {selectedBrewery.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <a href={`mailto:${selectedBrewery.email}`} className="text-primary hover:underline">{selectedBrewery.email}</a>
                  </div>
                )}
                {selectedBrewery.website && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <a href={selectedBrewery.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                      {selectedBrewery.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
              </div>

              {/* Visiting Info */}
              {selectedBrewery.visiting_info && (
                <div>
                  <Label className="text-muted-foreground text-xs uppercase">Visiting Information</Label>
                  <p className="text-sm mt-1">{selectedBrewery.visiting_info}</p>
                </div>
              )}

              {/* Gallery */}
              {Array.isArray(selectedBrewery.gallery_images) && selectedBrewery.gallery_images.length > 0 && (
                <div>
                  <Label className="text-muted-foreground text-xs uppercase">Gallery</Label>
                  <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                    {selectedBrewery.gallery_images.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`${selectedBrewery.name} ${i + 1}`}
                        className="w-20 h-20 rounded-md object-cover flex-shrink-0"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Source */}
              {selectedBrewery.source_url && (
                <a
                  href={selectedBrewery.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="w-3 h-3" />
                  View on JSS Directory
                </a>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Close</Button>
                <Button onClick={() => setEditMode(true)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </div>
            </div>
          )}

          {selectedBrewery && editMode && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Name</Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Prefecture</Label>
                  <Input value={editForm.prefecture} onChange={(e) => setEditForm(f => ({ ...f, prefecture: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input value={editForm.region} onChange={(e) => setEditForm(f => ({ ...f, region: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Founded Year</Label>
                  <Input value={editForm.founded_year} onChange={(e) => setEditForm(f => ({ ...f, founded_year: e.target.value }))} type="number" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input value={editForm.website} onChange={(e) => setEditForm(f => ({ ...f, website: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Address</Label>
                  <Input value={editForm.address} onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <textarea
                    className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editForm.description}
                    onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button onClick={handleSaveEdit} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
