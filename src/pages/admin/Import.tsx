import { useState } from "react";
import { AdminLayout } from "@/components/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Download, 
  Search, 
  Loader2, 
  CheckCircle, 
  ImagePlus, 
  Plus,
  AlertCircle,
  ExternalLink
} from "lucide-react";

interface ScrapedSake {
  name: string;
  nameJapanese?: string;
  brewery?: string;
  type?: string;
  prefecture?: string;
  imageUrl?: string;
  taste?: string;
  foodPairing?: string[];
}

interface SakeToImport extends ScrapedSake {
  isNew: boolean;
  existingId?: string;
  selected?: boolean;
}

interface MatchResult {
  updates: SakeToImport[];
  newSakes: SakeToImport[];
  totalMatched: number;
  totalNew: number;
  totalUpdates: number;
}

type ImportStep = 'idle' | 'scraping' | 'matching' | 'preview' | 'importing' | 'complete';

export default function AdminImport() {
  const [step, setStep] = useState<ImportStep>('idle');
  const [scrapedSakes, setScrapedSakes] = useState<ScrapedSake[]>([]);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());
  const [selectedNew, setSelectedNew] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ updatedCount: number; insertedCount: number; errors?: string[] } | null>(null);

  const baseUrl = import.meta.env.VITE_BACKEND_URL || '';

  const handleScrape = async () => {
    setStep('scraping');
    setError(null);
    setProgress(10);

    try {
      const response = await fetch(`${baseUrl}/api/scrape-sakura-sake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 1 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to scrape');
      }

      const data = await response.json();
      setScrapedSakes(data.sakes);
      setProgress(50);

      // Now match with database
      setStep('matching');
      
      const matchResponse = await fetch(`${baseUrl}/api/import-sakes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'match',
          sakes: data.sakes 
        }),
      });

      if (!matchResponse.ok) {
        const errorData = await matchResponse.json();
        throw new Error(errorData.error || 'Failed to match');
      }

      const matchData: MatchResult = await matchResponse.json();
      setMatchResult(matchData);
      
      // Pre-select all updates (missing images) and new sakes
      setSelectedUpdates(new Set(matchData.updates.map(s => s.existingId!)));
      setSelectedNew(new Set(matchData.newSakes.map(s => s.name)));
      
      setProgress(100);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('idle');
    }
  };

  const handleImport = async () => {
    if (!matchResult) return;

    setStep('importing');
    setProgress(0);
    setError(null);

    try {
      const updatesToImport = matchResult.updates.filter(s => selectedUpdates.has(s.existingId!));
      const newToImport = matchResult.newSakes.filter(s => selectedNew.has(s.name));

      const response = await fetch(`${baseUrl}/api/import-sakes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          updates: updatesToImport,
          newSakes: newToImport,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import');
      }

      const result = await response.json();
      setImportResult(result);
      setProgress(100);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  };

  const toggleUpdateSelection = (id: string) => {
    const newSelected = new Set(selectedUpdates);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedUpdates(newSelected);
  };

  const toggleNewSelection = (name: string) => {
    const newSelected = new Set(selectedNew);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedNew(newSelected);
  };

  const selectAllUpdates = () => {
    if (matchResult) {
      setSelectedUpdates(new Set(matchResult.updates.map(s => s.existingId!)));
    }
  };

  const selectAllNew = () => {
    if (matchResult) {
      setSelectedNew(new Set(matchResult.newSakes.map(s => s.name)));
    }
  };

  const deselectAllUpdates = () => setSelectedUpdates(new Set());
  const deselectAllNew = () => setSelectedNew(new Set());

  const resetImport = () => {
    setStep('idle');
    setScrapedSakes([]);
    setMatchResult(null);
    setSelectedUpdates(new Set());
    setSelectedNew(new Set());
    setProgress(0);
    setError(null);
    setImportResult(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold">Import Sakes</h1>
            <p className="text-muted-foreground">
              Import sake data from Sakura Sake Shop's catalog of 1000+ bottles
            </p>
          </div>
          <a 
            href="https://export.sakurasaketen.com/sake" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ExternalLink className="w-4 h-4" />
            View Source
          </a>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="p-4 bg-destructive/10 border-destructive">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          </Card>
        )}

        {/* Step: Idle - Start scraping */}
        {step === 'idle' && (
          <Card className="p-8 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Download className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Scan Sakura Sake Shop</h2>
              <p className="text-muted-foreground">
                Scan the Sakura Sake Shop catalog to find new sakes and images for your database.
                This will match against your existing sakes and identify what can be updated.
              </p>
              <Button onClick={handleScrape} size="lg" className="gap-2">
                <Search className="w-5 h-5" />
                Start Scanning
              </Button>
            </div>
          </Card>
        )}

        {/* Step: Scraping/Matching - Loading */}
        {(step === 'scraping' || step === 'matching') && (
          <Card className="p-8 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
              <h2 className="text-xl font-semibold">
                {step === 'scraping' ? 'Scanning Catalog...' : 'Matching with Database...'}
              </h2>
              <p className="text-muted-foreground">
                {step === 'scraping' 
                  ? 'Extracting sake data from Sakura Sake Shop...'
                  : 'Comparing scraped data with your existing database...'}
              </p>
              <Progress value={progress} className="w-full" />
            </div>
          </Card>
        )}

        {/* Step: Preview - Show results */}
        {step === 'preview' && matchResult && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Search className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{scrapedSakes.length}</p>
                    <p className="text-sm text-muted-foreground">Sakes Found</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <ImagePlus className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{matchResult.totalUpdates}</p>
                    <p className="text-sm text-muted-foreground">Missing Images</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{matchResult.totalNew}</p>
                    <p className="text-sm text-muted-foreground">New Sakes</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Tabs for Updates and New */}
            <Tabs defaultValue="updates" className="space-y-4">
              <TabsList>
                <TabsTrigger value="updates" className="gap-2">
                  <ImagePlus className="w-4 h-4" />
                  Image Updates ({selectedUpdates.size}/{matchResult.updates.length})
                </TabsTrigger>
                <TabsTrigger value="new" className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Sakes ({selectedNew.size}/{matchResult.newSakes.length})
                </TabsTrigger>
              </TabsList>

              {/* Updates Tab */}
              <TabsContent value="updates">
                <Card>
                  <div className="p-4 border-b flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      These existing sakes are missing images and can be updated
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAllUpdates}>
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={deselectAllUpdates}>
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  {matchResult.updates.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No existing sakes need image updates
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Sake Name</TableHead>
                          <TableHead className="hidden md:table-cell">Brewery</TableHead>
                          <TableHead className="hidden lg:table-cell">Image</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matchResult.updates.map((sake) => (
                          <TableRow key={sake.existingId}>
                            <TableCell>
                              <Checkbox
                                checked={selectedUpdates.has(sake.existingId!)}
                                onCheckedChange={() => toggleUpdateSelection(sake.existingId!)}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{sake.name}</p>
                                {sake.nameJapanese && (
                                  <p className="text-sm text-muted-foreground">{sake.nameJapanese}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {sake.brewery || '-'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {sake.imageUrl ? (
                                <img 
                                  src={sake.imageUrl} 
                                  alt={sake.name}
                                  className="w-12 h-12 object-contain rounded"
                                />
                              ) : (
                                <span className="text-muted-foreground">No image</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              </TabsContent>

              {/* New Sakes Tab */}
              <TabsContent value="new">
                <Card>
                  <div className="p-4 border-b flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      These sakes are not in your database and can be added
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAllNew}>
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={deselectAllNew}>
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  {matchResult.newSakes.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No new sakes found to add
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Sake Name</TableHead>
                          <TableHead className="hidden md:table-cell">Brewery</TableHead>
                          <TableHead className="hidden sm:table-cell">Type</TableHead>
                          <TableHead className="hidden lg:table-cell">Prefecture</TableHead>
                          <TableHead className="hidden xl:table-cell">Image</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matchResult.newSakes.map((sake) => (
                          <TableRow key={sake.name}>
                            <TableCell>
                              <Checkbox
                                checked={selectedNew.has(sake.name)}
                                onCheckedChange={() => toggleNewSelection(sake.name)}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{sake.name}</p>
                                {sake.nameJapanese && (
                                  <p className="text-sm text-muted-foreground">{sake.nameJapanese}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {sake.brewery || '-'}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {sake.type ? (
                                <Badge variant="secondary">{sake.type}</Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {sake.prefecture || '-'}
                            </TableCell>
                            <TableCell className="hidden xl:table-cell">
                              {sake.imageUrl ? (
                                <img 
                                  src={sake.imageUrl} 
                                  alt={sake.name}
                                  className="w-12 h-12 object-contain rounded"
                                />
                              ) : (
                                <span className="text-muted-foreground">No image</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              </TabsContent>
            </Tabs>

            {/* Import Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={resetImport}>
                Cancel
              </Button>
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  {selectedUpdates.size + selectedNew.size} items selected
                </p>
                <Button 
                  onClick={handleImport}
                  disabled={selectedUpdates.size + selectedNew.size === 0}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Import Selected
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <Card className="p-8 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
              <h2 className="text-xl font-semibold">Importing...</h2>
              <p className="text-muted-foreground">
                Adding sakes and updating images in your database...
              </p>
              <Progress value={progress} className="w-full" />
            </div>
          </Card>
        )}

        {/* Step: Complete */}
        {step === 'complete' && importResult && (
          <Card className="p-8 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold">Import Complete!</h2>
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{importResult.updatedCount}</span> sakes updated with images
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{importResult.insertedCount}</span> new sakes added
                </p>
              </div>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="text-left p-3 bg-destructive/10 rounded-lg">
                  <p className="text-sm font-medium text-destructive mb-1">Some errors occurred:</p>
                  <ul className="text-sm text-destructive/80 list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li>...and {importResult.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
              <Button onClick={resetImport} className="gap-2">
                <Search className="w-4 h-4" />
                Scan Again
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
