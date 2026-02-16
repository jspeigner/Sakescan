import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, MoreHorizontal, MapPin, Loader2, Wine, Pencil, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

interface BreweryData {
  name: string;
  sakeCount: number;
  prefectures: string[];
  avgRating: number | null;
}

const PAGE_SIZE = 20;

export default function AdminBreweries() {
  const navigate = useNavigate();
  const [breweries, setBreweries] = useState<BreweryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  
  // Rename modal state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [selectedBrewery, setSelectedBrewery] = useState<BreweryData | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const fetchBreweries = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all sakes to aggregate brewery data
      const { data: sakes, error } = await supabase
        .from('sake')
        .select('brewery, prefecture, average_rating');

      if (error) throw error;

      // Aggregate brewery data
      const breweryMap = new Map<string, {
        sakeCount: number;
        prefectures: Set<string>;
        ratings: number[];
      }>();

      (sakes || []).forEach((sake) => {
        if (!sake.brewery) return;
        
        const existing = breweryMap.get(sake.brewery) || {
          sakeCount: 0,
          prefectures: new Set<string>(),
          ratings: [],
        };

        existing.sakeCount++;
        if (sake.prefecture) {
          existing.prefectures.add(sake.prefecture);
        }
        if (sake.average_rating) {
          existing.ratings.push(sake.average_rating);
        }

        breweryMap.set(sake.brewery, existing);
      });

      // Convert to array and calculate averages
      let breweryList: BreweryData[] = Array.from(breweryMap.entries()).map(([name, data]) => ({
        name,
        sakeCount: data.sakeCount,
        prefectures: Array.from(data.prefectures),
        avgRating: data.ratings.length > 0
          ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length
          : null,
      }));

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        breweryList = breweryList.filter(b => 
          b.name.toLowerCase().includes(query) ||
          b.prefectures.some(p => p.toLowerCase().includes(query))
        );
      }

      // Sort by sake count descending
      breweryList.sort((a, b) => b.sakeCount - a.sakeCount);

      setTotalCount(breweryList.length);

      // Paginate
      const paginatedList = breweryList.slice(
        page * PAGE_SIZE,
        (page + 1) * PAGE_SIZE
      );

      setBreweries(paginatedList);
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

  const handleViewSakes = (breweryName: string) => {
    // Navigate to sakes page with brewery filter
    navigate(`/admin/sakes?brewery=${encodeURIComponent(breweryName)}`);
  };

  const handleRename = (brewery: BreweryData) => {
    setSelectedBrewery(brewery);
    setNewName(brewery.name);
    setRenameModalOpen(true);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBrewery || !newName.trim()) return;

    setRenaming(true);
    try {
      // Update all sakes with this brewery name
      const { error } = await supabase
        .from('sake')
        .update({ brewery: newName.trim() })
        .eq('brewery', selectedBrewery.name);

      if (error) throw error;

      setRenameModalOpen(false);
      setSelectedBrewery(null);
      setNewName("");
      fetchBreweries();
    } catch (error) {
      console.error('Error renaming brewery:', error);
      alert('Failed to rename brewery');
    } finally {
      setRenaming(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold">Breweries</h1>
            <p className="text-muted-foreground">
              Breweries are extracted from your sake database. {totalCount} unique breweries found.
            </p>
          </div>
        </div>

        {/* Search */}
        <Card className="p-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or prefecture..."
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
          ) : breweries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No breweries found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brewery Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Prefecture(s)</TableHead>
                  <TableHead className="hidden md:table-cell">Sakes</TableHead>
                  <TableHead className="hidden lg:table-cell">Avg Rating</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breweries.map((brewery) => (
                  <TableRow key={brewery.name}>
                    <TableCell className="font-medium">{brewery.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {brewery.prefectures.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          {brewery.prefectures.join(', ')}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Wine className="w-3.5 h-3.5 text-muted-foreground" />
                        {brewery.sakeCount} {brewery.sakeCount === 1 ? 'sake' : 'sakes'}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {brewery.avgRating ? brewery.avgRating.toFixed(1) : '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewSakes(brewery.name)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Sakes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRename(brewery)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename Brewery
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
            Showing {breweries.length > 0 ? page * PAGE_SIZE + 1 : 0} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} breweries
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

      {/* Rename Modal */}
      <Dialog open={renameModalOpen} onOpenChange={setRenameModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Brewery</DialogTitle>
            <DialogDescription>
              This will update the brewery name on all {selectedBrewery?.sakeCount} sakes from this brewery.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newName">New Brewery Name</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter new name"
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setRenameModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={renaming || !newName.trim()}>
                {renaming && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Rename
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
