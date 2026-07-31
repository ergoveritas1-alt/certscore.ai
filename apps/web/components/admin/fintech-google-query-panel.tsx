"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@website-signal-risk-scanner/ui";
import { useMemo, useState, useTransition } from "react";
import { generateGoogleQueryUrls } from "../../server/settings/generate-google-query-urls";
import { updateFintechSourcingSearchTerms } from "../../server/settings/fintech-sourcing-search-terms";

function parseSearchTerms(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

export function FintechGoogleQueryPanel({ initialSearchTerms }: { initialSearchTerms: string[] }) {
  const [draftValue, setDraftValue] = useState("");
  const [searchTerms, setSearchTerms] = useState<string[]>(initialSearchTerms);
  const [domainList, setDomainList] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [activeGeneratedTerm, setActiveGeneratedTerm] = useState<string | null>(null);
  const [generatingTerm, setGeneratingTerm] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  const helperText = useMemo(() => {
    if (searchTerms.length === 0) {
      return "Add one or more search terms to build the Google query list.";
    }

    return "Separate terms with commas, semicolons, or new lines.";
  }, [searchTerms.length]);

  function handleAddTerms() {
    const nextTerms = parseSearchTerms(draftValue);

    if (nextTerms.length === 0) {
      return;
    }

    const seen = new Set(searchTerms.map((term) => term.toLowerCase()));
    const mergedTerms = [...searchTerms];

    nextTerms.forEach((term) => {
      const normalizedTerm = term.toLowerCase();

      if (seen.has(normalizedTerm)) {
        return;
      }

      seen.add(normalizedTerm);
      mergedTerms.push(term);
    });

    setSearchTerms(mergedTerms);
    setDraftValue("");
    setSaveError(null);
    startSaving(async () => {
      try {
        const savedTerms = await updateFintechSourcingSearchTerms(mergedTerms);
        setSearchTerms(savedTerms);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Could not save search terms.");
      }
    });
  }

  function handleGenerateDomainForTerm(term: string) {
    setGenerateError(null);
    setGeneratingTerm(term);
    startGenerating(async () => {
      try {
        const urls = await generateGoogleQueryUrls(term);
        setDomainList(urls);
        setActiveGeneratedTerm(term);
      } catch (error) {
        setGenerateError(error instanceof Error ? error.message : "Could not generate Google search URLs.");
      } finally {
        setGeneratingTerm(null);
      }
    });
  }

  function handleRemoveTerm(termToRemove: string) {
    const nextTerms = searchTerms.filter((term) => term !== termToRemove);
    setSearchTerms(nextTerms);
    if (activeGeneratedTerm === termToRemove) {
      setActiveGeneratedTerm(null);
      setDomainList([]);
      setGenerateError(null);
    }
    setSaveError(null);
    startSaving(async () => {
      try {
        const savedTerms = await updateFintechSourcingSearchTerms(nextTerms);
        setSearchTerms(savedTerms);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Could not save search terms.");
      }
    });
  }

  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-lg text-slate-950">Google query</CardTitle>
        <p className="text-sm text-slate-600">
          Capture search terms on the left, then generate a candidate domain list on the right.
        </p>
      </CardHeader>
      <CardContent className="pb-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="flex min-h-[28rem] flex-col rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-slate-950">Search terms</h2>
              <p className="text-sm text-slate-600">{helperText}</p>
            </div>

            <div className="mt-4 space-y-3">
              <div className="relative">
                <Input
                  id="fintech-search-terms"
                  className="h-11 rounded-2xl border-slate-300 bg-white pr-28 text-sm text-slate-900 shadow-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-slate-200"
                  onChange={(event) => setDraftValue(event.target.value)}
                  placeholder="banking as a service, embedded finance; payments infrastructure"
                  type="text"
                  value={draftValue}
                />
                <Button
                  className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-xl px-3"
                  disabled={draftValue.trim().length === 0 || isSaving}
                  onClick={handleAddTerms}
                  size="sm"
                  type="button"
                >
                  {isSaving ? "Saving..." : "Add"}
                </Button>
              </div>
              {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
            </div>

            <div className="mt-4 flex h-[22rem] flex-col rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-medium text-slate-900">Search term list</p>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {searchTerms.length === 0 ? (
                  <p className="text-sm text-slate-500">No search terms added yet.</p>
                ) : (
                  searchTerms.map((term) => (
                    <div
                      key={term}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <span className="text-sm text-slate-800">{term}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          disabled={isGenerating}
                          onClick={() => handleGenerateDomainForTerm(term)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {generatingTerm === term ? "Generating..." : "Generate"}
                        </Button>
                        <button
                          className="app-raised-button rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                          onClick={() => handleRemoveTerm(term)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="flex min-h-[28rem] flex-col rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-slate-950">Domain list</h2>
              <p className="text-sm text-slate-600">
                {activeGeneratedTerm ? `Results for: ${activeGeneratedTerm}` : "Generated URLs will appear in the list window below."}
              </p>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-medium text-slate-900">List window</p>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {generateError ? <p className="text-sm text-red-600">{generateError}</p> : null}
                {domainList.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No URLs generated yet. Use a search-term Generate button to load Google search results.
                  </p>
                ) : (
                  domainList.map((domain) => (
                    <div key={domain} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      {domain}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
