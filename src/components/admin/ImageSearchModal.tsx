import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Search, ExternalLink, Check, ImageIcon, Database } from "lucide-react";

interface SearchImage {
  url: string;
  thumbnail?: string;
  source: string;
  title?: string;
}

interface SakeData {
  name?: string;
  nameJapanese?: string;
  brewery?: string;
  type?: string;
  prefecture?: string;
  description?: string;
  polishingRatio?: number;
  alcoholPercentage?: number;
}

interface SearchResult {
  images: SearchImage[];
  sakeData?: SakeData;
}

interface ImageSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sakeName: string;
  sakeNameJapanese?: string;
  brewery?: string;
  currentType?: string;
  currentPrefecture?: string;
  onSelectImage: (url: string, field: 'label_image_url' | 'bottle_image_url') => void;
  onImportData: (data: Partial<SakeData>) => void;
}

export function ImageSearchModal({
  open,
  onOpenChange,
  sakeName,
  sakeNameJapanese,
  brewery,
  currentType,
  currentPrefecture,
  onSelectImage,
  onImportData,
}: ImageSearchModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageField, setImageField] = useState<'label_image_url' | 'bottle_image_url'>('label_image_url');
  const [dataToImport, setDataToImport] = useState<Set<keyof SakeData>>(new Set());

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    setSelectedImage(null);
    setDataToImport(new Set());

    try {
      const response = await fetch('/api/search-sake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: sakeName,
          nameJapanese: sakeNameJapanese,
          brewery: brewery,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Search failed');
      }

      const data = await response.json();
      setResults(data);

      if (data.images.length === 0) {
        setError('No images found. Try adjusting the sake name or adding Japanese name.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInGoogle = () => {
    const query = [sakeName, sakeNameJapanese, brewery, 'sake bottle']
      .filter(Boolean)
      .join(' ');
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`, '_blank');
  };

  const handleConfirmImage = () => {
    if (selectedImage) {
      onSelectImage(selectedImage, imageField);
      setSelectedImage(null);
    }
  };

  const handleImportData = () => {
    if (results?.sakeData && dataToImport.size > 0) {
      const importData: Partial<SakeData> = {};
      dataToImport.forEach((key) => {
        if (results.sakeData?.[key] !== undefined) {
          (importData as Record<string, unknown>)[key] = results.sakeData[key];
        }
      });
      onImportData(importData);
    }
  };

  const toggleDataImport = (key: keyof SakeData) => {
    setDataToImport((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getDataLabel = (key: keyof SakeData): string => {
    const labels: Record<keyof SakeData, string> = {
      name: 'Name',
      nameJapanese: 'Japanese Name',
      brewery: 'Brewery',
      type: 'Type',
      prefecture: 'Prefecture',
      description: 'Description',
      polishingRatio: 'Polishing Ratio',
      alcoholPercentage: 'ABV',
    };
    return labels[key];
  };

  const availableDataFields = results?.sakeData
    ? (Object.entries(results.sakeData) as [keyof SakeData, unknown][])
        .filter(([key, value]) => {
          if (value === undefined || value === null) return false;
          // Only show fields that are missing or different
          if (key === 'type' && currentType) return false;
          if (key === 'prefecture' && currentPrefecture) return false;
          return true;
        })
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Find Sake Images & Data
          </DialogTitle>
          <DialogDescription>
            Search for images and additional data for "{sakeName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Search Actions */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Search with Firecrawl
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleOpenInGoogle}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Google Images
            </Button>
          </div>

          {/* Error */}
          {error ? (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              {error}
            </div>
          ) : null}

          {/* Results */}
          {results ? (
            <div className="space-y-6">
              {/* Found Images */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-medium">Found Images ({results.images.length})</h3>
                </div>
                
                {results.images.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                      {results.images.map((image, index) => (
                        <Card
                          key={index}
                          className={`relative cursor-pointer overflow-hidden transition-all hover:ring-2 hover:ring-primary/50 ${
                            selectedImage === image.url ? 'ring-2 ring-primary' : ''
                          }`}
                          onClick={() => setSelectedImage(image.url)}
                        >
                          <div className="aspect-square relative">
                            <img
                              src={image.url}
                              alt={image.title || 'Sake image'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/placeholder.svg';
                              }}
                            />
                            {selectedImage === image.url ? (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <Check className="w-8 h-8 text-primary" />
                              </div>
                            ) : null}
                          </div>
                          <div className="p-2">
                            <Badge variant="secondary" className="text-xs">
                              {image.source}
                            </Badge>
                          </div>
                        </Card>
                      ))}
                    </div>

                    {selectedImage ? (
                      <div className="flex flex-wrap items-center gap-3 p-3 bg-muted rounded-lg">
                        <span className="text-sm font-medium">Use as:</span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={imageField === 'label_image_url' ? 'default' : 'outline'}
                            onClick={() => setImageField('label_image_url')}
                          >
                            Label Image
                          </Button>
                          <Button
                            size="sm"
                            variant={imageField === 'bottle_image_url' ? 'default' : 'outline'}
                            onClick={() => setImageField('bottle_image_url')}
                          >
                            Bottle Image
                          </Button>
                        </div>
                        <Button size="sm" onClick={handleConfirmImage}>
                          <Check className="w-4 h-4 mr-1" />
                          Confirm
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No images found from automated search.</p>
                )}
              </div>

              {/* Found Data */}
              {availableDataFields.length > 0 ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Database className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-medium">Found Data</h3>
                  </div>
                  
                  <Card className="p-4">
                    <div className="space-y-3">
                      {availableDataFields.map(([key, value]) => (
                        <div key={key} className="flex items-start gap-3">
                          <Checkbox
                            id={`import-${key}`}
                            checked={dataToImport.has(key)}
                            onCheckedChange={() => toggleDataImport(key)}
                          />
                          <div className="flex-1 min-w-0">
                            <Label
                              htmlFor={`import-${key}`}
                              className="font-medium cursor-pointer"
                            >
                              {getDataLabel(key)}
                            </Label>
                            <p className="text-sm text-muted-foreground truncate">
                              {String(value)}{key === 'polishingRatio' ? '%' : ''}{key === 'alcoholPercentage' ? '%' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {dataToImport.size > 0 ? (
                      <Button
                        size="sm"
                        className="mt-4"
                        onClick={handleImportData}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Import Selected Data
                      </Button>
                    ) : null}
                  </Card>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Tips */}
          {!loading && !results ? (
            <Card className="p-4 bg-muted/50">
              <h4 className="font-medium mb-2">Search Tips</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Make sure the sake name is accurate for best results</li>
                <li>• Adding the Japanese name improves search quality</li>
                <li>• The search checks Tippsy Sake, Sake Times, and Google Images</li>
                <li>• Use "Open Google Images" to manually find and copy image URLs</li>
              </ul>
            </Card>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
