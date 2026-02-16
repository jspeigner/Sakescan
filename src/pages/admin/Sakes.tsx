import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin";
import { SakeModal } from "@/components/admin/SakeModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, MoreHorizontal, Loader2, Pencil, Trash2, Star, ImageOff, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Sake } from "@/lib/supabase-types";

const PAGE_SIZE = 20;

export default function AdminSakes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const breweryFilter = searchParams.get('brewery') || '';
  
  const [sakes, setSakes] = useState<Sake[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSake, setEditingSake] = useState<Sake | null>(null);
  const [filter, setFilter] = useState<'all' | 'missing_images'>('all');
  const [missingImagesCount, setMissingImagesCount] = useState(0);

  const clearBreweryFilter = () => {
    setSearchParams({});
    setPage(0);
  };

  const fetchSakes = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sake')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,name_japanese.ilike.%${searchQuery}%,brewery.ilike.%${searchQuery}%`);
      }

      // Apply brewery filter from URL
      if (breweryFilter) {
        query = query.eq('brewery', breweryFilter);
      }

      // Apply filter for missing images
      if (filter === 'missing_images') {
        query = query.or('label_image_url.is.null,label_image_url.eq.');
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setSakes(data || []);
      setTotalCount(count || 0);

      // Fetch count of sakes with missing images (for the tab badge)
      let missingQuery = supabase
        .from('sake')
        .select('*', { count: 'exact', head: true })
        .or('label_image_url.is.null,label_image_url.eq.');
      
      if (breweryFilter) {
        missingQuery = missingQuery.eq('brewery', breweryFilter);
      }
      
      const { count: missingCount } = await missingQuery;
      setMissingImagesCount(missingCount || 0);
    } catch (error) {
      console.error('Error fetching sakes:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, filter, breweryFilter]);

  useEffect(() => {
    fetchSakes();
  }, [fetchSakes]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchSakes();
  };

  const handleEdit = (sake: Sake) => {
    setEditingSake(sake);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditingSake(null);
    setModalOpen(true);
  };

  const handleDelete = async (sake: Sake) => {
    if (!confirm(`Are you sure you want to delete "${sake.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('sake')
        .delete()
        .eq('id', sake.id);

      if (error) throw error;
      fetchSakes();
    } catch (error) {
      console.error('Error deleting sake:', error);
      alert('Failed to delete sake');
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold">Sakes</h1>
            <p className="text-muted-foreground">Manage the sake database</p>
          </div>
          <Button className="gap-2" onClick={handleAdd}>
            <Plus className="w-4 h-4" />
            Add Sake
          </Button>
        </div>

        {/* Brewery Filter Badge */}
        {breweryFilter ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtered by brewery:</span>
            <Badge variant="secondary" className="gap-1">
              {breweryFilter}
              <button onClick={clearBreweryFilter} className="ml-1 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          </div>
        ) : null}

        {/* Filters */}
        <Tabs value={filter} onValueChange={(v) => { setFilter(v as 'all' | 'missing_images'); setPage(0); }}>
          <TabsList>
            <TabsTrigger value="all">All Sakes</TabsTrigger>
            <TabsTrigger value="missing_images" className="gap-2">
              <ImageOff className="w-4 h-4" />
              Missing Images
              {missingImagesCount > 0 ? (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground">
                  {missingImagesCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <Card className="p-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, Japanese name, or brewery..."
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
          ) : sakes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No sakes found</p>
              <Button variant="link" onClick={handleAdd}>Add your first sake</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Image</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Brewery</TableHead>
                  <TableHead className="hidden lg:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Region</TableHead>
                  <TableHead className="hidden sm:table-cell">Rating</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sakes.map((sake) => (
                  <TableRow key={sake.id}>
                    <TableCell>
                      {sake.label_image_url ? (
                        <img
                          src={sake.label_image_url}
                          alt={sake.name}
                          className="w-10 h-10 rounded object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                          <ImageOff className="w-4 h-4 text-destructive/60" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{sake.name}</p>
                        {sake.name_japanese && (
                          <p className="text-xs text-muted-foreground">{sake.name_japanese}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{sake.brewery}</TableCell>
                    <TableCell className="hidden lg:table-cell">{sake.type || '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{sake.prefecture || sake.region || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {sake.average_rating ? (
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-accent text-accent" />
                          <span>{sake.average_rating.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">({sake.total_ratings})</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(sake)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(sake)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
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
            Showing {sakes.length > 0 ? page * PAGE_SIZE + 1 : 0} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} sakes
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

      {/* Sake Modal */}
      <SakeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        sake={editingSake}
        onSaved={fetchSakes}
      />
    </AdminLayout>
  );
}
