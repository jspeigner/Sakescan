import { useState, useRef, useEffect } from "react";
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
  ExternalLink,
  Building2,
  Wine,
  Copy,
  CheckCheck,
  ImageIcon,
  Play,
  Clock
} from "lucide-react";

// ---- Shared types ----

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

interface SakeMatchResult {
  updates: SakeToImport[];
  newSakes: SakeToImport[];
  totalMatched: number;
  totalNew: number;
  totalUpdates: number;
}

interface BreweryInput {
  name: string;
  prefecture?: string;
  region?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  founded_year?: number;
  representative?: string;
  brands?: string[];
  description?: string;
  visiting_info?: string;
  tour_available?: boolean;
  image_url?: string;
  gallery_images?: string[];
  source_url?: string;
}

type SakeImportStep = 'idle' | 'scraping' | 'matching' | 'preview' | 'importing' | 'complete';
type BreweryImportStep = 'idle' | 'checking' | 'needs-table' | 'loading' | 'preview' | 'importing' | 'complete';

const BATCH_SIZE = 20;

export default function AdminImport() {
  const [activeTab, setActiveTab] = useState<'sakes' | 'breweries' | 'images'>('breweries');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold">Import Data</h1>
            <p className="text-muted-foreground">
              Import sakes and breweries from external sources
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="breweries" className="gap-2">
              <Building2 className="w-4 h-4" />
              Breweries
            </TabsTrigger>
            <TabsTrigger value="sakes" className="gap-2">
              <Wine className="w-4 h-4" />
              Sakes (Sakura Sake)
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-2">
              <ImageIcon className="w-4 h-4" />
              Image Processor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="breweries" className="space-y-6">
            <BreweryImportPanel />
          </TabsContent>

          <TabsContent value="sakes" className="space-y-6">
            <SakeImportPanel />
          </TabsContent>

          <TabsContent value="images" className="space-y-6">
            <ImageProcessorPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// ================= BREWERY IMPORT =================

function BreweryImportPanel() {
  const [step, setStep] = useState<BreweryImportStep>('idle');
  const [breweries, setBreweries] = useState<BreweryInput[]>([]);
  const [existingCount, setExistingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [setupSql, setSetupSql] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [progress, setProgress] = useState(0);
  const [batchInfo, setBatchInfo] = useState({ current: 0, total: 0 });
  const [importResult, setImportResult] = useState<{
    insertedCount: number;
    skippedCount: number;
    imageCount: number;
    errors?: string[];
  } | null>(null);
  const abortRef = useRef(false);

  const checkTable = async () => {
    setStep('checking');
    setError(null);

    try {
      const response = await fetch('/api/setup-breweries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (data.exists) {
        setExistingCount(data.rowCount || 0);
        loadJsonData();
      } else {
        // Try to auto-create the table
        const createResponse = await fetch('/api/setup-breweries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        });
        const createData = await createResponse.json();

        if (createData.exists) {
          setExistingCount(createData.rowCount || 0);
          loadJsonData();
        } else {
          setSetupSql(createData.sql || null);
          setStep('needs-table');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check table');
      setStep('idle');
    }
  };

  const loadJsonData = async () => {
    setStep('loading');
    setError(null);

    try {
      const response = await fetch('/data/sake_breweries_database.json');
      if (!response.ok) throw new Error('Failed to load brewery data file');

      const data = await response.json();
      const breweryList: BreweryInput[] = data.breweries || [];

      setBreweries(breweryList);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setStep('idle');
    }
  };

  const handleCopySql = async () => {
    if (setupSql) {
      await navigator.clipboard.writeText(setupSql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    }
  };

  const handleImport = async () => {
    setStep('importing');
    setProgress(0);
    setError(null);
    abortRef.current = false;

    const totalBatches = Math.ceil(breweries.length / BATCH_SIZE);
    setBatchInfo({ current: 0, total: totalBatches });

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalImages = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < breweries.length; i += BATCH_SIZE) {
      if (abortRef.current) break;

      const batch = breweries.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      setBatchInfo({ current: batchNum, total: totalBatches });
      setProgress(Math.round((i / breweries.length) * 100));

      try {
        const response = await fetch('/api/import-breweries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ breweries: batch }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          allErrors.push(`Batch ${batchNum}: ${errorData.error || 'Failed'}`);
          continue;
        }

        const result = await response.json();
        totalInserted += result.insertedCount || 0;
        totalSkipped += result.skippedCount || 0;
        totalImages += result.imageCount || 0;
        if (result.errors) {
          allErrors.push(...result.errors);
        }
      } catch (err) {
        allErrors.push(`Batch ${batchNum}: ${err instanceof Error ? err.message : 'Failed'}`);
      }
    }

    setProgress(100);
    setImportResult({
      insertedCount: totalInserted,
      skippedCount: totalSkipped,
      imageCount: totalImages,
      errors: allErrors.length > 0 ? allErrors : undefined,
    });
    setStep('complete');
  };

  const resetImport = () => {
    setStep('idle');
    setBreweries([]);
    setError(null);
    setSetupSql(null);
    setProgress(0);
    setImportResult(null);
    abortRef.current = false;
  };

  // --- IDLE ---
  if (step === 'idle') {
    return (
      <Card className="p-8 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Import Breweries</h2>
          <p className="text-muted-foreground">
            Import 1,614 Japanese sake breweries from the Japan Sake and Shochu Makers Association database, 
            including images, contact info, and descriptions.
          </p>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
          <Button onClick={checkTable} size="lg" className="gap-2">
            <Search className="w-5 h-5" />
            Start Import
          </Button>
        </div>
      </Card>
    );
  }

  // --- CHECKING / LOADING ---
  if (step === 'checking' || step === 'loading') {
    return (
      <Card className="p-8 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <h2 className="text-xl font-semibold">
            {step === 'checking' ? 'Checking Database...' : 'Loading Brewery Data...'}
          </h2>
          <p className="text-muted-foreground">
            {step === 'checking'
              ? 'Verifying the breweries table exists...'
              : 'Reading brewery data from JSON file...'}
          </p>
        </div>
      </Card>
    );
  }

  // --- NEEDS TABLE ---
  if (step === 'needs-table') {
    const handleCreateTable = async () => {
      setStep('checking');
      setError(null);
      try {
        const response = await fetch('/api/setup-breweries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        });
        const data = await response.json();
        if (data.exists) {
          setExistingCount(data.rowCount || 0);
          loadJsonData();
        } else {
          setSetupSql(data.sql || null);
          setStep('needs-table');
          setError('Auto-creation failed. Please run the SQL manually in Supabase.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create table');
        setStep('needs-table');
      }
    };

    return (
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-amber-500" />
          <h2 className="text-lg font-semibold">Breweries Table Needed</h2>
        </div>
        <p className="text-muted-foreground">
          The breweries table doesn't exist yet. Click the button below to create it, or copy the SQL 
          and run it in Supabase manually.
        </p>
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleCreateTable} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Table Automatically
          </Button>
          <Button onClick={checkTable} variant="outline" className="gap-2">
            <Search className="w-4 h-4" />
            Check Again
          </Button>
        </div>
        {setupSql && (
          <details className="mt-2">
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
              Manual option: view SQL
            </summary>
            <div className="relative mt-2">
              <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto max-h-[300px]">
                {setupSql}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 gap-1"
                onClick={handleCopySql}
              >
                {copiedSql ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedSql ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <a
              href="https://supabase.com/dashboard/project/qpsdebikkmcdzddhphlk/sql/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="w-3 h-3" />
              Open Supabase SQL Editor
            </a>
          </details>
        )}
      </Card>
    );
  }

  // --- PREVIEW ---
  if (step === 'preview') {
    const newCount = breweries.length - existingCount;
    const withImage = breweries.filter(b => b.image_url).length;

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{breweries.length}</p>
                <p className="text-sm text-muted-foreground">In JSON File</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Plus className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{newCount > 0 ? `~${newCount}` : breweries.length}</p>
                <p className="text-sm text-muted-foreground">New to Import</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <ImagePlus className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{withImage}</p>
                <p className="text-sm text-muted-foreground">With Images</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Math.ceil(breweries.length / BATCH_SIZE)}</p>
                <p className="text-sm text-muted-foreground">Batches</p>
              </div>
            </div>
          </Card>
        </div>

        {existingCount > 0 && (
          <Card className="p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              Your database already has <span className="font-medium text-foreground">{existingCount}</span> breweries. 
              Duplicates will be automatically skipped during import.
            </p>
          </Card>
        )}

        {/* Preview Table */}
        <Card>
          <div className="p-4 border-b">
            <p className="text-sm text-muted-foreground">
              Preview of first 20 breweries (of {breweries.length} total)
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Prefecture</TableHead>
                <TableHead className="hidden md:table-cell">Founded</TableHead>
                <TableHead className="hidden lg:table-cell">Brands</TableHead>
                <TableHead className="hidden xl:table-cell">Image</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breweries.slice(0, 20).map((brewery, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{brewery.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{brewery.prefecture || '-'}</TableCell>
                  <TableCell className="hidden md:table-cell">{brewery.founded_year || '-'}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {brewery.brands && brewery.brands.length > 0 ? (
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
                  <TableCell className="hidden xl:table-cell">
                    {brewery.image_url ? (
                      <img src={brewery.image_url} alt={brewery.name} className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <span className="text-muted-foreground text-sm">None</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={resetImport}>Cancel</Button>
          <Button onClick={handleImport} size="lg" className="gap-2">
            <Download className="w-5 h-5" />
            Import All {breweries.length} Breweries
          </Button>
        </div>
      </>
    );
  }

  // --- IMPORTING ---
  if (step === 'importing') {
    return (
      <Card className="p-8 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <h2 className="text-xl font-semibold">Importing Breweries...</h2>
          <p className="text-muted-foreground">
            Batch {batchInfo.current} of {batchInfo.total} — downloading images and inserting records
          </p>
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-muted-foreground">
            {Math.round(progress)}% complete — ~{Math.round((batchInfo.total - batchInfo.current) * 3)} seconds remaining
          </p>
          <Button variant="outline" size="sm" onClick={() => { abortRef.current = true; }}>
            Stop Import
          </Button>
        </div>
      </Card>
    );
  }

  // --- COMPLETE ---
  if (step === 'complete' && importResult) {
    return (
      <Card className="p-8 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold">Import Complete!</h2>
          <div className="space-y-2">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{importResult.insertedCount}</span> breweries imported
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{importResult.skippedCount}</span> duplicates skipped
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{importResult.imageCount}</span> images downloaded
            </p>
          </div>
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="text-left p-3 bg-destructive/10 rounded-lg max-h-[200px] overflow-y-auto">
              <p className="text-sm font-medium text-destructive mb-1">
                {importResult.errors.length} errors:
              </p>
              <ul className="text-sm text-destructive/80 list-disc list-inside">
                {importResult.errors.slice(0, 10).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {importResult.errors.length > 10 && (
                  <li>...and {importResult.errors.length - 10} more</li>
                )}
              </ul>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <Button onClick={resetImport} variant="outline" className="gap-2">
              <Search className="w-4 h-4" />
              Import Again
            </Button>
            <a href="/admin/breweries">
              <Button className="gap-2">
                <Building2 className="w-4 h-4" />
                View Breweries
              </Button>
            </a>
          </div>
        </div>
      </Card>
    );
  }

  return null;
}

// ================= SAKE IMPORT (existing logic) =================

function SakeImportPanel() {
  const [step, setStep] = useState<SakeImportStep>('idle');
  const [scrapedSakes, setScrapedSakes] = useState<ScrapedSake[]>([]);
  const [matchResult, setMatchResult] = useState<SakeMatchResult | null>(null);
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());
  const [selectedNew, setSelectedNew] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ updatedCount: number; insertedCount: number; errors?: string[] } | null>(null);

  const handleScrape = async () => {
    setStep('scraping');
    setError(null);
    setProgress(10);

    try {
      const response = await fetch('/api/scrape-sakura-sake', {
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

      setStep('matching');

      const matchResponse = await fetch('/api/import-sakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'match', sakes: data.sakes }),
      });

      if (!matchResponse.ok) {
        const errorData = await matchResponse.json();
        throw new Error(errorData.error || 'Failed to match');
      }

      const matchData: SakeMatchResult = await matchResponse.json();
      setMatchResult(matchData);
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

      const response = await fetch('/api/import-sakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', updates: updatesToImport, newSakes: newToImport }),
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
    const s = new Set(selectedUpdates);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedUpdates(s);
  };

  const toggleNewSelection = (name: string) => {
    const s = new Set(selectedNew);
    if (s.has(name)) s.delete(name); else s.add(name);
    setSelectedNew(s);
  };

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

  // --- IDLE ---
  if (step === 'idle') {
    return (
      <Card className="p-8 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Download className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Scan Sakura Sake Shop</h2>
          <p className="text-muted-foreground">
            Scan the Sakura Sake Shop catalog to find new sakes and images for your database.
          </p>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <Button onClick={handleScrape} size="lg" className="gap-2">
              <Search className="w-5 h-5" />
              Start Scanning
            </Button>
            <a href="https://export.sakurasaketen.com/sake" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon"><ExternalLink className="w-4 h-4" /></Button>
            </a>
          </div>
        </div>
      </Card>
    );
  }

  // --- SCRAPING / MATCHING ---
  if (step === 'scraping' || step === 'matching') {
    return (
      <Card className="p-8 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <h2 className="text-xl font-semibold">
            {step === 'scraping' ? 'Scanning Catalog...' : 'Matching with Database...'}
          </h2>
          <Progress value={progress} className="w-full" />
        </div>
      </Card>
    );
  }

  // --- PREVIEW ---
  if (step === 'preview' && matchResult) {
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-2xl font-bold">{scrapedSakes.length}</p>
            <p className="text-sm text-muted-foreground">Sakes Found</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold">{matchResult.totalUpdates}</p>
            <p className="text-sm text-muted-foreground">Image Updates</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold">{matchResult.totalNew}</p>
            <p className="text-sm text-muted-foreground">New Sakes</p>
          </Card>
        </div>

        <Tabs defaultValue="updates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="updates">Updates ({selectedUpdates.size}/{matchResult.updates.length})</TabsTrigger>
            <TabsTrigger value="new">New ({selectedNew.size}/{matchResult.newSakes.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="updates">
            <Card>
              <div className="p-4 border-b flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Existing sakes missing images</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedUpdates(new Set(matchResult.updates.map(s => s.existingId!)))}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedUpdates(new Set())}>Deselect All</Button>
                </div>
              </div>
              {matchResult.updates.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No updates needed</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-12"></TableHead><TableHead>Name</TableHead><TableHead className="hidden md:table-cell">Brewery</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {matchResult.updates.map((sake) => (
                      <TableRow key={sake.existingId}>
                        <TableCell><Checkbox checked={selectedUpdates.has(sake.existingId!)} onCheckedChange={() => toggleUpdateSelection(sake.existingId!)} /></TableCell>
                        <TableCell className="font-medium">{sake.name}</TableCell>
                        <TableCell className="hidden md:table-cell">{sake.brewery || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="new">
            <Card>
              <div className="p-4 border-b flex items-center justify-between">
                <p className="text-sm text-muted-foreground">New sakes to add</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedNew(new Set(matchResult.newSakes.map(s => s.name)))}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedNew(new Set())}>Deselect All</Button>
                </div>
              </div>
              {matchResult.newSakes.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No new sakes found</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-12"></TableHead><TableHead>Name</TableHead><TableHead className="hidden md:table-cell">Brewery</TableHead><TableHead className="hidden sm:table-cell">Type</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {matchResult.newSakes.map((sake) => (
                      <TableRow key={sake.name}>
                        <TableCell><Checkbox checked={selectedNew.has(sake.name)} onCheckedChange={() => toggleNewSelection(sake.name)} /></TableCell>
                        <TableCell className="font-medium">{sake.name}</TableCell>
                        <TableCell className="hidden md:table-cell">{sake.brewery || '-'}</TableCell>
                        <TableCell className="hidden sm:table-cell">{sake.type ? <Badge variant="secondary">{sake.type}</Badge> : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={resetImport}>Cancel</Button>
          <Button onClick={handleImport} disabled={selectedUpdates.size + selectedNew.size === 0} className="gap-2">
            <Download className="w-4 h-4" />
            Import Selected ({selectedUpdates.size + selectedNew.size})
          </Button>
        </div>
      </>
    );
  }

  // --- IMPORTING ---
  if (step === 'importing') {
    return (
      <Card className="p-8 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <h2 className="text-xl font-semibold">Importing...</h2>
          <Progress value={progress} className="w-full" />
        </div>
      </Card>
    );
  }

  // --- COMPLETE ---
  if (step === 'complete' && importResult) {
    return (
      <Card className="p-8 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold">Import Complete!</h2>
          <p className="text-muted-foreground">
            {importResult.updatedCount} updated, {importResult.insertedCount} added
          </p>
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="text-left p-3 bg-destructive/10 rounded-lg">
              <ul className="text-sm text-destructive/80 list-disc list-inside">
                {importResult.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          <Button onClick={resetImport} className="gap-2">
            <Search className="w-4 h-4" />
            Scan Again
          </Button>
        </div>
      </Card>
    );
  }

  return null;
}

// ================= IMAGE PROCESSOR =================

interface ProcessingStatus {
  success: boolean;
  processed: number;
  galleryProcessed: number;
  sakeProcessed: number;
  breweryMainProcessed: number;
  failed: number;
  remaining: {
    breweryMainImages: number;
    breweryGalleryImages: number;
    sakeImages: number;
  };
  errors?: string[];
  timestamp: string;
}

function ImageProcessorPanel() {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runHistory, setRunHistory] = useState<ProcessingStatus[]>([]);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cron/process-images', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to run');
      const data: ProcessingStatus = await response.json();
      setStatus(data);
      setRunHistory(prev => [data, ...prev].slice(0, 10));
    } catch (err) {
      console.error('Status check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunBatch = async () => {
    setRunning(true);
    try {
      const response = await fetch('/api/cron/process-images', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to process');
      const data: ProcessingStatus = await response.json();
      setStatus(data);
      setRunHistory(prev => [data, ...prev].slice(0, 10));
    } catch (err) {
      console.error('Processing failed:', err);
    } finally {
      setRunning(false);
    }
  };

  const handleRunMultiple = async (batches: number) => {
    setRunning(true);
    for (let i = 0; i < batches; i++) {
      try {
        const response = await fetch('/api/cron/process-images', { method: 'POST' });
        if (!response.ok) break;
        const data: ProcessingStatus = await response.json();
        setStatus(data);
        setRunHistory(prev => [data, ...prev].slice(0, 10));

                if (data.remaining.breweryMainImages === 0 && data.remaining.breweryGalleryImages === 0 && (data.remaining.sakeImages || 0) === 0) {
          break;
        }
      } catch {
        break;
      }
    }
    setRunning(false);
  };

  const totalRemaining = status
    ? status.remaining.breweryMainImages + status.remaining.breweryGalleryImages + (status.remaining.sakeImages || 0)
    : null;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-2 flex-1">
            <h2 className="text-lg font-semibold">Background Image Processor</h2>
            <p className="text-sm text-muted-foreground">
              Automatically downloads external images and stores them in Supabase storage. 
              Runs as a scheduled cron job every 6 hours, processing 15 images per run. 
              You can also trigger it manually below.
            </p>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Cron schedule: every 6 hours (4 times/day)</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-center space-y-1">
            <p className="text-3xl font-bold">
              {status ? (status.remaining.sakeImages || '?') : '?'}
            </p>
            <p className="text-sm text-muted-foreground">Sake Images</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center space-y-1">
            <p className="text-3xl font-bold">
              {status ? status.remaining.breweryMainImages : '?'}
            </p>
            <p className="text-sm text-muted-foreground">Brewery Images</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center space-y-1">
            <p className="text-3xl font-bold">
              {status ? status.remaining.breweryGalleryImages : '?'}
            </p>
            <p className="text-sm text-muted-foreground">Gallery Images</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center space-y-1">
            <p className="text-3xl font-bold">
              {totalRemaining !== null ? (
                totalRemaining === 0 ? (
                  <span className="text-green-500">Done</span>
                ) : totalRemaining.toLocaleString()
              ) : '?'}
            </p>
            <p className="text-sm text-muted-foreground">Total Remaining</p>
          </div>
        </Card>
      </div>

      {status && totalRemaining !== null && totalRemaining > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Estimated completion</span>
            <span className="font-medium">
              ~{Math.ceil(totalRemaining / (15 * 4))} days at current rate
            </span>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleRunBatch} disabled={running || loading} className="gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run 1 Batch (15 images)
        </Button>
        <Button variant="outline" onClick={() => handleRunMultiple(5)} disabled={running || loading} className="gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run 5 Batches (75 images)
        </Button>
        <Button variant="outline" onClick={() => handleRunMultiple(20)} disabled={running || loading} className="gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run 20 Batches (300 images)
        </Button>
        <Button variant="ghost" onClick={fetchStatus} disabled={loading || running} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Check Status
        </Button>
      </div>

      {status && (
        <Card className="p-4 space-y-3">
          <h3 className="font-medium">Last Run Result</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Sake</p>
              <p className="font-medium text-green-600">{status.sakeProcessed || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Brewery</p>
              <p className="font-medium text-green-600">{status.breweryMainProcessed || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Gallery</p>
              <p className="font-medium text-green-600">{status.galleryProcessed}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Failed</p>
              <p className="font-medium text-destructive">{status.failed}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Time</p>
              <p className="font-medium">{new Date(status.timestamp).toLocaleTimeString()}</p>
            </div>
          </div>
          {status.errors && status.errors.length > 0 && (
            <div className="p-3 bg-destructive/10 rounded-lg">
              <p className="text-sm font-medium text-destructive mb-1">Errors:</p>
              <ul className="text-xs text-destructive/80 list-disc list-inside">
                {status.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}

      {runHistory.length > 1 && (
        <Card className="p-4">
          <h3 className="font-medium mb-3">Run History (this session)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Processed</TableHead>
                <TableHead>Gallery</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead className="hidden sm:table-cell">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runHistory.map((run, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{new Date(run.timestamp).toLocaleTimeString()}</TableCell>
                  <TableCell className="text-green-600">{run.processed}</TableCell>
                  <TableCell className="text-green-600">{run.galleryProcessed}</TableCell>
                  <TableCell className="text-destructive">{run.failed}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {run.remaining.breweryMainImages + run.remaining.breweryGalleryImages}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
