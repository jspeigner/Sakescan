import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, MoreHorizontal, Star, Loader2, Trash2, Eye, Pencil, Wine, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

interface ReviewWithDetails {
  id: string;
  user_id: string;
  sake_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
  sake?: {
    id: string;
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
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [ratingFilter, setRatingFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5'>('all');
  
  // View/Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<ReviewWithDetails | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editRating, setEditRating] = useState(0);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      // Build query
      let query = supabase
        .from('ratings')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply rating filter
      if (ratingFilter !== 'all') {
        query = query.eq('rating', parseInt(ratingFilter));
      }

      // Get all for search filtering (we'll filter client-side after enrichment)
      const { data: reviewsData, error: reviewsError, count } = await query;

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

      let enrichedReviews: ReviewWithDetails[] = (reviewsData || []).map(review => ({
        ...review,
        sake: sakesMap.get(review.sake_id),
        user: usersMap.get(review.user_id)
      }));

      // Apply search filter (client-side after enrichment)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        enrichedReviews = enrichedReviews.filter(r => 
          r.sake?.name?.toLowerCase().includes(query) ||
          r.sake?.brewery?.toLowerCase().includes(query) ||
          r.user?.display_name?.toLowerCase().includes(query) ||
          r.user?.email?.toLowerCase().includes(query) ||
          r.review_text?.toLowerCase().includes(query)
        );
      }

      setTotalCount(enrichedReviews.length);

      // Paginate
      const paginatedReviews = enrichedReviews.slice(
        page * PAGE_SIZE,
        (page + 1) * PAGE_SIZE
      );

      setReviews(paginatedReviews);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, ratingFilter]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchReviews();
  };

  const handleViewReview = (review: ReviewWithDetails) => {
    setSelectedReview(review);
    setEditMode(false);
    setEditRating(review.rating);
    setEditText(review.review_text || "");
    setModalOpen(true);
  };

  const handleEditReview = (review: ReviewWithDetails) => {
    setSelectedReview(review);
    setEditMode(true);
    setEditRating(review.rating);
    setEditText(review.review_text || "");
    setModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedReview) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ratings')
        .update({
          rating: editRating,
          review_text: editText || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedReview.id);

      if (error) throw error;

      setModalOpen(false);
      setSelectedReview(null);
      fetchReviews();
    } catch (error) {
      console.error('Error updating review:', error);
      alert('Failed to update review');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (review: ReviewWithDetails) => {
    if (!confirm('Are you sure you want to delete this review? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('ratings')
        .delete()
        .eq('id', review.id);

      if (error) throw error;
      
      // Close modal if deleting currently viewed review
      if (selectedReview?.id === review.id) {
        setModalOpen(false);
        setSelectedReview(null);
      }
      
      fetchReviews();
    } catch (error) {
      console.error('Error deleting review:', error);
      alert('Failed to delete review');
    }
  };

  const handleViewSake = (sakeId: string) => {
    navigate(`/admin/sakes?edit=${sakeId}`);
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

  const StarRating = ({ rating, interactive = false, onChange }: { rating: number; interactive?: boolean; onChange?: (r: number) => void }) => (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(star)}
          className={interactive ? "cursor-pointer hover:scale-110 transition-transform" : "cursor-default"}
        >
          <Star
            className={`w-5 h-5 ${
              star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted"
            }`}
          />
        </button>
      ))}
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold">Reviews</h1>
            <p className="text-muted-foreground">View and moderate user reviews ({totalCount} total)</p>
          </div>
        </div>

        {/* Rating Filter Tabs */}
        <Tabs value={ratingFilter} onValueChange={(v) => { setRatingFilter(v as typeof ratingFilter); setPage(0); }}>
          <TabsList>
            <TabsTrigger value="all">All Ratings</TabsTrigger>
            <TabsTrigger value="5" className="gap-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> 5
            </TabsTrigger>
            <TabsTrigger value="4" className="gap-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> 4
            </TabsTrigger>
            <TabsTrigger value="3" className="gap-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> 3
            </TabsTrigger>
            <TabsTrigger value="2" className="gap-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> 2
            </TabsTrigger>
            <TabsTrigger value="1" className="gap-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> 1
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <Card className="p-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by sake name, brewery, user, or review text..."
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
                  <TableRow key={review.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewReview(review)}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{review.sake?.name || 'Unknown Sake'}</p>
                        <p className="text-sm text-muted-foreground truncate">{review.sake?.brewery || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        {review.user?.display_name || review.user?.email?.split('@')[0] || 'Anonymous'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted"
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewReview(review)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Review
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditReview(review)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit Review
                          </DropdownMenuItem>
                          {review.sake?.id && (
                            <DropdownMenuItem onClick={() => handleViewSake(review.sake!.id)}>
                              <Wine className="w-4 h-4 mr-2" />
                              View Sake
                            </DropdownMenuItem>
                          )}
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

      {/* View/Edit Review Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Edit Review' : 'Review Details'}</DialogTitle>
            <DialogDescription>
              {selectedReview?.sake?.name ? `Review for ${selectedReview.sake.name}` : 'Review details'}
            </DialogDescription>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-4">
              {/* Sake Info */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-start gap-3">
                  <Wine className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">{selectedReview.sake?.name || 'Unknown Sake'}</p>
                    <p className="text-sm text-muted-foreground">{selectedReview.sake?.brewery || 'Unknown Brewery'}</p>
                  </div>
                </div>
              </div>

              {/* User Info */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="w-4 h-4" />
                <span>
                  {selectedReview.user?.display_name || selectedReview.user?.email || 'Anonymous User'}
                </span>
                <span className="text-muted">•</span>
                <span>{formatFullDate(selectedReview.created_at)}</span>
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <Label>Rating</Label>
                {editMode ? (
                  <StarRating rating={editRating} interactive onChange={setEditRating} />
                ) : (
                  <StarRating rating={selectedReview.rating} />
                )}
              </div>

              {/* Review Text */}
              <div className="space-y-2">
                <Label>Review Text</Label>
                {editMode ? (
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="No review text..."
                    rows={4}
                  />
                ) : (
                  <div className="p-3 bg-muted/30 rounded-lg min-h-[80px]">
                    {selectedReview.review_text || (
                      <span className="text-muted-foreground italic">No review text provided</span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-between pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(selectedReview)}
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
