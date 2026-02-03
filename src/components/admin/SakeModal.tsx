import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import type { Sake } from "@/lib/supabase-types";
import { Loader2, Upload, X } from "lucide-react";

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
  label_image_url: string;
  bottle_image_url: string;
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
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    label_image_url: "",
    bottle_image_url: "",
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
        label_image_url: sake.label_image_url || "",
        bottle_image_url: sake.bottle_image_url || "",
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
        label_image_url: "",
        bottle_image_url: "",
      });
    }
  }, [sake, open]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'label_image_url' | 'bottle_image_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `sake-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('sake-images')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('sake-images')
        .getPublicUrl(filePath);

      setForm(prev => ({ ...prev, [field]: data.publicUrl }));
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
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
      const payload = {
        ...form,
        polishing_ratio: form.polishing_ratio ? Number(form.polishing_ratio) : null,
        alcohol_percentage: form.alcohol_percentage ? Number(form.alcohol_percentage) : null,
        smv: form.smv ? Number(form.smv) : null,
        acidity: form.acidity ? Number(form.acidity) : null,
        updated_at: new Date().toISOString(),
      };

      if (sake) {
        const { error } = await supabase
          .from('sake')
          .update(payload)
          .eq('id', sake.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sake')
          .insert(payload);
        if (error) throw error;
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

          {/* Images */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Label Image</Label>
              {form.label_image_url ? (
                <div className="relative w-full h-40 rounded-lg border border-border overflow-hidden">
                  <img
                    src={form.label_image_url}
                    alt="Label"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, label_image_url: "" }))}
                    className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Upload label image</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, 'label_image_url')}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>

            <div className="space-y-2">
              <Label>Bottle Image</Label>
              {form.bottle_image_url ? (
                <div className="relative w-full h-40 rounded-lg border border-border overflow-hidden">
                  <img
                    src={form.bottle_image_url}
                    alt="Bottle"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, bottle_image_url: "" }))}
                    className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Upload bottle image</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, 'bottle_image_url')}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Or paste URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="label_url">Or paste label image URL</Label>
              <Input
                id="label_url"
                value={form.label_image_url || ""}
                onChange={(e) => setForm(prev => ({ ...prev, label_image_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bottle_url">Or paste bottle image URL</Label>
              <Input
                id="bottle_url"
                value={form.bottle_image_url || ""}
                onChange={(e) => setForm(prev => ({ ...prev, bottle_image_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
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
    </Dialog>
  );
}
