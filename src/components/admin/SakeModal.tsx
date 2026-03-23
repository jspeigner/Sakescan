import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import type { Sake } from "@/lib/supabase-types";
import { Loader2, Upload, X, Search } from "lucide-react";
import { ImageSearchModal } from "./ImageSearchModal";

interface SakeFormData {
  name: string;
  name_japanese: string;
  brewery: string;
  type: string;
  subtype: string;
  region: string;
  prefecture: string;
  description: string;
  rice_variety: string;
  polishing_ratio: number | null;
  alcohol_percentage: number | null;
  smv: number | null;
  acidity: number | null;
  image_url: string;
}

interface SakeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sake: Sake | null;
  onSaved: () => void;
}

const SAKE_TYPES = [
  "Junmai",
  "Junmai Ginjo",
  "Junmai Daiginjo",
  "Honjozo",
  "Ginjo",
  "Daiginjo",
  "Tokubetsu Junmai",
  "Tokubetsu Honjozo",
  "Futsushu",
  "Nigori",
  "Sparkling",
  "Nama",
  "Other",
];

const PREFECTURES = [
  "Niigata", "Yamaguchi", "Hyogo", "Kyoto", "Akita", "Yamagata",
  "Fukushima", "Nagano", "Hiroshima", "Fukui", "Ishikawa", "Miyagi",
  "Iwate", "Aomori", "Hokkaido", "Shizuoka", "Mie", "Nara", "Wakayama",
  "Okayama", "Tottori", "Shimane", "Tokushima", "Kagawa", "Ehime", "Kochi",
  "Fukuoka", "Saga", "Nagasaki", "Kumamoto", "Oita", "Miyazaki", "Kagoshima",
  "Tokyo", "Saitama", "Chiba", "Kanagawa", "Gunma", "Tochigi", "Ibaraki",
  "Gifu", "Aichi", "Shiga", "Osaka", "Okinawa",
];

export function SakeModal({ open, onOpenChange, sake, onSaved }: SakeModalProps) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [form, setForm] = useState<SakeFormData>({
    name: "",
    name_japanese: "",
    brewery: "",
    type: "",
    subtype: "",
    region: "",
    prefecture: "",
    description: "",
    rice_variety: "",
    polishing_ratio: null,
    alcohol_percentage: null,
    smv: null,
    acidity: null,
    image_url: "",
  });

  useEffect(() => {
    if (sake) {
      setForm({
        name: sake.name,
        name_japanese: sake.name_japanese || "",
        brewery: sake.brewery,
        type: sake.type || "",
        subtype: sake.subtype || "",
        region: sake.region || "",
        prefecture: sake.prefecture || "",
        description: sake.description || "",
        rice_variety: sake.rice_variety || "",
        polishing_ratio: sake.polishing_ratio,
        alcohol_percentage: sake.alcohol_percentage,
        smv: sake.smv,
        acidity: sake.acidity,
        image_url: sake.image_url || "",
      });
    } else {
      setForm({
        name: "",
        name_japanese: "",
        brewery: "",
        type: "",
        subtype: "",
        region: "",
        prefecture: "",
        description: "",
        rice_variety: "",
        polishing_ratio: null,
        alcohol_percentage: null,
        smv: null,
        acidity: null,
        image_url: "",
      });
    }
  }, [sake, open]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxBytes = 2.5 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert(
        `This image is too large (max 2.5MB for admin upload). This file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Compress it or use a smaller photo.`
      );
      e.target.value = "";
      return;
    }

    const token = session?.access_token;
    if (!token) {
      alert("Sign in again as admin, then retry the upload.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/upload-sake-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageBase64,
          contentType: file.type || "image/jpeg",
          originalFileName: file.name,
        }),
      });

      const data = (await response.json()) as { error?: string; url?: string };

      if (!response.ok) {
        throw new Error(data.error || `Upload failed (${response.status})`);
      }
      if (!data.url) {
        throw new Error("Server did not return an image URL");
      }

      setForm((prev) => ({ ...prev, image_url: data.url as string }));
    } catch (error) {
      console.error("Error uploading image:", error);
      alert(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSelectImage = (url: string) => {
    setForm((prev) => ({ ...prev, image_url: url }));
  };

  const handleImportData = (data: Record<string, unknown>) => {
    setForm(prev => ({
      ...prev,
      type: (data.type as string) || prev.type,
      prefecture: (data.prefecture as string) || prev.prefecture,
      region: (data.prefecture as string) || prev.region,
      polishing_ratio: (data.polishingRatio as number) || prev.polishing_ratio,
      alcohol_percentage: (data.alcoholPercentage as number) || prev.alcohol_percentage,
      description: (data.description as string) || prev.description,
    }));
  };

  // Helper to check if URL is from our Supabase storage
  const isSupabaseUrl = (url: string) => {
    return url.includes('supabase.co') || url.includes('supabase.in');
  };

  // Download external image and save to Supabase storage
  const downloadExternalImage = async (imageUrl: string): Promise<string> => {
    if (!imageUrl || isSupabaseUrl(imageUrl)) {
      return imageUrl; // Already in our storage or empty
    }

    try {
      const response = await fetch('/api/download-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          sakeName: form.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download image');
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('Failed to download image:', error);
      // Return original URL if download fails, user can retry
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.brewery) {
      alert('Name and Brewery are required');
      return;
    }

    setLoading(true);
    try {
      let imageUrl = form.image_url;
      if (imageUrl && !isSupabaseUrl(imageUrl)) {
        try {
          imageUrl = await downloadExternalImage(imageUrl);
        } catch {
          if (!confirm("Failed to download image. Save with external URL anyway?")) {
            setLoading(false);
            return;
          }
        }
      }

      const imageFinal =
        imageUrl && String(imageUrl).trim() !== "" ? String(imageUrl).trim() : null;

      const payload = {
        name: form.name,
        name_japanese: form.name_japanese.trim() || null,
        brewery: form.brewery,
        type: form.type.trim() || null,
        subtype: form.subtype.trim() || null,
        region: form.region.trim() || null,
        prefecture: form.prefecture.trim() || null,
        description: form.description.trim() || null,
        rice_variety: form.rice_variety.trim() || null,
        polishing_ratio:
          form.polishing_ratio === null || form.polishing_ratio === undefined
            ? null
            : Number(form.polishing_ratio),
        alcohol_percentage:
          form.alcohol_percentage === null || form.alcohol_percentage === undefined
            ? null
            : Number(form.alcohol_percentage),
        smv: form.smv === null || form.smv === undefined ? null : Number(form.smv),
        acidity: form.acidity === null || form.acidity === undefined ? null : Number(form.acidity),
        image_url: imageFinal,
        updated_at: new Date().toISOString(),
      };

      const prevImage = sake?.image_url?.trim() || null;
      const storageUrlsToRemove: string[] = [];
      if (sake && prevImage && prevImage !== imageFinal && isSupabaseUrl(prevImage)) {
        storageUrlsToRemove.push(prevImage);
      }

      let savedId: string;
      if (sake) {
        const { error } = await supabase.from("sake").update(payload).eq("id", sake.id);
        if (error) throw error;
        savedId = sake.id;
      } else {
        const { data: inserted, error } = await supabase
          .from("sake")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (!inserted?.id) throw new Error("Insert did not return id");
        savedId = inserted.id;
      }

      const token = session?.access_token;
      if (token) {
        const syncRes = await fetch("/api/admin-sync-sake-images", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sakeId: savedId,
            image_url: imageFinal,
          }),
        });
        if (!syncRes.ok) {
          const errBody = await syncRes.text();
          console.error("admin-sync-sake-images failed:", syncRes.status, errBody);
          if (syncRes.status >= 500 || syncRes.status === 401 || syncRes.status === 403) {
            alert(
              "Image might not have updated. Confirm SUPABASE_SERVICE_ROLE_KEY and admin session on Vercel, then save again."
            );
          }
        }
      }

      if (token && storageUrlsToRemove.length > 0) {
        for (const publicUrl of storageUrlsToRemove) {
          try {
            const delRes = await fetch("/api/delete-sake-storage", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ publicUrl }),
            });
            if (!delRes.ok) {
              console.warn("Could not remove old file from storage:", await delRes.text());
            }
          } catch (e) {
            console.warn("Storage delete request failed:", e);
          }
        }
      }

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving sake:', error);
      alert('Failed to save sake');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sake ? 'Edit Sake' : 'Add New Sake'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Dassai 23"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name_japanese">Japanese Name</Label>
              <Input
                id="name_japanese"
                value={form.name_japanese || ""}
                onChange={(e) => setForm(prev => ({ ...prev, name_japanese: e.target.value }))}
                placeholder="獺祭 二割三分"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brewery">Brewery *</Label>
              <Input
                id="brewery"
                value={form.brewery}
                onChange={(e) => setForm(prev => ({ ...prev, brewery: e.target.value }))}
                placeholder="Asahi Shuzo"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={form.type || ""}
                onValueChange={(value) => setForm(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {SAKE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prefecture">Prefecture</Label>
              <Select
                value={form.prefecture || ""}
                onValueChange={(value) => setForm(prev => ({ ...prev, prefecture: value, region: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select prefecture" />
                </SelectTrigger>
                <SelectContent>
                  {PREFECTURES.map((pref) => (
                    <SelectItem key={pref} value={pref}>{pref}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rice_variety">Rice Variety</Label>
              <Input
                id="rice_variety"
                value={form.rice_variety || ""}
                onChange={(e) => setForm(prev => ({ ...prev, rice_variety: e.target.value }))}
                placeholder="Yamada Nishiki"
              />
            </div>
          </div>

          {/* Technical Details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="polishing_ratio">Polish %</Label>
              <Input
                id="polishing_ratio"
                type="number"
                value={form.polishing_ratio || ""}
                onChange={(e) => setForm(prev => ({ ...prev, polishing_ratio: e.target.value ? Number(e.target.value) : null }))}
                placeholder="50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alcohol_percentage">ABV %</Label>
              <Input
                id="alcohol_percentage"
                type="number"
                step="0.1"
                value={form.alcohol_percentage || ""}
                onChange={(e) => setForm(prev => ({ ...prev, alcohol_percentage: e.target.value ? Number(e.target.value) : null }))}
                placeholder="16"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smv">SMV</Label>
              <Input
                id="smv"
                type="number"
                value={form.smv || ""}
                onChange={(e) => setForm(prev => ({ ...prev, smv: e.target.value ? Number(e.target.value) : null }))}
                placeholder="+3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acidity">Acidity</Label>
              <Input
                id="acidity"
                type="number"
                step="0.1"
                value={form.acidity || ""}
                onChange={(e) => setForm(prev => ({ ...prev, acidity: e.target.value ? Number(e.target.value) : null }))}
                placeholder="1.4"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description || ""}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the sake's flavor profile, aroma, and recommended pairings..."
              rows={4}
            />
          </div>

          {/* Sake image */}
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label>Sake image</Label>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  One photo per sake (label or bottle). Used on the website, admin list, and mobile app.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setForm((prev) => ({ ...prev, image_url: "" }))}
                >
                  Clear image
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setImageSearchOpen(true)}
                  disabled={!form.name}
                >
                  <Search className="w-4 h-4 mr-2" />
                  Find Images
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-w-md">
              {form.image_url ? (
                <div className="relative w-full h-48 rounded-lg border border-border overflow-hidden">
                  <img src={form.image_url} alt="Sake" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, image_url: "" }))}
                    className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Upload image</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleImageUpload(e)}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>

            <div className="space-y-2 max-w-md">
              <Label htmlFor="image_url_paste">Or paste image URL</Label>
              <Input
                id="image_url_paste"
                value={form.image_url || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Uploads go through the server (up to 2.5MB). External URLs download to our storage when you save.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || uploading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {sake ? 'Save Changes' : 'Add Sake'}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Image Search Modal */}
      <ImageSearchModal
        open={imageSearchOpen}
        onOpenChange={setImageSearchOpen}
        sakeName={form.name}
        sakeNameJapanese={form.name_japanese}
        brewery={form.brewery}
        currentType={form.type}
        currentPrefecture={form.prefecture}
        onSelectImage={handleSelectImage}
        onImportData={handleImportData}
      />
    </Dialog>
  );
}
