import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, MoreHorizontal, Star, Loader2, Trash2, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ReviewWithDetails {
  id: string;
  user_id: string;
  sake_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
  sake?: {
    name: string;
    brewery: string;
  };
  user?: {
    display_name: string | null;
    email: string | null;
  };
}

const PAGE_SIZE = 20;

export default function AdminReviews() {
  const [reviews, setReviews] = useState<ReviewWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      // First get the reviews with count
      const { data: reviewsData, error: reviewsError, count } = await supabase
        .from('ratings')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (reviewsError) throw reviewsError;

      // Get sake details for each review
      const sakeIds = [...new Set(reviewsData?.map(r => r.sake_id) || [])];
      const userIds = [...new Set(reviewsData?.map(r => r.user_id) || [])];

      const [sakesRes, usersRes] = await Promise.all([
        sakeIds.length > 0
          ? supabase.from('sake').select('id, name, brewery').in('id', sakeIds)
          : { data: [] },
        userIds.length > 0
          ? supabase.from('users').select('id, display_name, email').in('id', userIds)
          : { data: [] }
      ]);

      const sakesMap = new Map((sakesRes.data || []).map(s => [s.id, s]));
      const usersMap = new Map((usersRes.data || []).map(u => [u.id, u]));

      const enrichedReviews: ReviewWithDetails[] = (reviewsData || []).map(review => ({
        ...review,
        sake: sakesMap.get(review.sake_id),
        user: usersMap.get(review.user_id)
      }));

      setReviews(enrichedReviews);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchReviews();
  };

  const handleDelete = async (review: ReviewWithDetails) => {
    if (!confirm('Are you sure you want to delete this review?')) return;

    try {
      const { error } = await supabase
        .from('ratings')
        .delete()
        .eq('id', review.id);

      if (error) throw error;
      fetchReviews();
    } catch (error) {
      console.error('Error deleting review:', error);
      alert('Failed to delete review');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold">Reviews</h1>
            <p className="text-muted-foreground">View and moderate user reviews</p>
          </div>
        </div>

        {/* Search */}
        <Card className="p-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search reviews..."
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
          ) : reviews.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No reviews found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sake</TableHead>
                  <TableHead className="hidden md:table-cell">User</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="hidden lg:table-cell">Review</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{review.sake?.name || 'Unknown Sake'}</p>
                        <p className="text-sm text-muted-foreground truncate">{review.sake?.brewery || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {review.user?.display_name || review.user?.email || 'Anonymous'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < review.rating ? "fill-accent text-accent" : "text-muted"
                            }`}
                          />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell max-w-[250px]">
                      <p className="truncate text-sm text-muted-foreground">
                        {review.review_text || <span className="italic">No review text</span>}
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {formatDate(review.created_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="w-4 h-4 mr-2" />
                            View Full Review
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(review)}
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
            Showing {reviews.length > 0 ? page * PAGE_SIZE + 1 : 0} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} reviews
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
    </AdminLayout>
  );
}
