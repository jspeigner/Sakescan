import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { CareerJob } from "@/lib/careers";
import { Loader2, Upload } from "lucide-react";

type Props = {
  job: CareerJob;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function CareerApplicationForm({ job }: Props) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [promptAnswer, setPromptAnswer] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!resumeFile) throw new Error("Please attach your resume");
      const resumeBase64 = await fileToBase64(resumeFile);
      const response = await fetch("/api/apply-career", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobSlug: job.slug,
          jobTitle: job.title,
          fullName,
          email,
          location: location || undefined,
          portfolioUrl: portfolioUrl || undefined,
          coverNote,
          promptAnswer: promptAnswer || undefined,
          resumeBase64,
          resumeFileName: resumeFile.name,
          resumeContentType: resumeFile.type || "application/pdf",
        }),
      });
      const json = (await response.json()) as { error?: string; id?: string; success?: boolean };
      if (!response.ok) {
        throw new Error(json.error || "Application failed");
      }
      return json;
    },
    onSuccess: (data) => {
      setSubmittedId(data.id ?? "ok");
      toast({
        title: "Application submitted",
        description: "Thanks — we received your resume and will be in touch.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not submit",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    applyMutation.mutate();
  };

  if (submittedId) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 text-center">
        <h3 className="text-lg font-semibold mb-2">Application received</h3>
        <p className="text-sm text-muted-foreground">
          Thanks for applying to {job.title}. We&apos;ll review your materials and follow up by email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="location">Location / time zone</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Bogotá, GMT-5"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="portfolio">Portfolio / LinkedIn / work links</Label>
          <Input
            id="portfolio"
            type="url"
            value={portfolioUrl}
            onChange={(e) => setPortfolioUrl(e.target.value)}
            placeholder="https://"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="coverNote">Cover note</Label>
        <Textarea
          id="coverNote"
          required
          rows={5}
          value={coverNote}
          onChange={(e) => setCoverNote(e.target.value)}
          placeholder={job.howToApply}
        />
        <p className="text-xs text-muted-foreground">{job.howToApply}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="promptAnswer">Role prompt answer (optional but recommended)</Label>
        <Textarea
          id="promptAnswer"
          rows={3}
          value={promptAnswer}
          onChange={(e) => setPromptAnswer(e.target.value)}
          placeholder="Answer the application prompt from the job post"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="resume">Resume (PDF, DOC, DOCX — max 4MB)</Label>
        <div className="flex items-center gap-3">
          <Input
            id="resume"
            type="file"
            required
            accept=".pdf,.doc,.docx,.txt,.rtf,application/pdf"
            onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
            className="cursor-pointer"
          />
        </div>
        {resumeFile ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Upload className="w-3.5 h-3.5" />
            {resumeFile.name}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full sm:w-auto min-h-[44px]" disabled={applyMutation.isPending}>
        {applyMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit application"
        )}
      </Button>
    </form>
  );
}
