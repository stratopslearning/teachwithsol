"use client";
import { apiFetch } from "@/lib/api/client";
import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Users, CheckCircle, XCircle, AlertCircle, Download } from '@/components/icons';
import Papa from 'papaparse';
import { toast } from 'sonner';

interface UserImportData {
  email: string;
  firstName: string;
  lastName: string;
  role: 'STUDENT' | 'PROFESSOR' | 'ADMIN';
  paid: boolean;
}

interface ImportResult {
  success: boolean;
  message: string;
  details?: any;
}

export default function BulkImportModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [csvData, setCsvData] = useState<UserImportData[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [currentStep, setCurrentStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      toast.error('Please upload a valid CSV file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        Papa.parse<string>(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const parsedData = results.data as any[];
            const validatedData: UserImportData[] = [];
            const errors: string[] = [];

            parsedData.forEach((row, index) => {
              const rowNumber = index + 2; // +2 because of 0-index and header row
              
              // Validate required fields
              if (!row.email || !row.role) {
                errors.push(`Row ${rowNumber}: Missing required fields (email and role are required)`);
                return;
              }

              // Validate email format
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(row.email)) {
                errors.push(`Row ${rowNumber}: Invalid email format`);
                return;
              }

              // Validate role
              if (!['STUDENT', 'PROFESSOR', 'ADMIN'].includes(row.role)) {
                errors.push(`Row ${rowNumber}: Invalid role. Must be STUDENT, PROFESSOR, or ADMIN`);
                return;
              }

              // Validate paid field
              let paid = false;
              if (row.paid !== undefined && row.paid !== '') {
                if (typeof row.paid === 'string') {
                  paid = row.paid.toLowerCase() === 'true' || row.paid === '1';
                } else {
                  paid = Boolean(row.paid);
                }
              }

              validatedData.push({
                email: row.email,
                firstName: row.firstName || '',
                lastName: row.lastName || '',
                role: row.role,
                paid
              });
            });

            if (errors.length > 0) {
              setValidationErrors(errors);
              toast.error(`${errors.length} validation errors found`);
            } else {
              setValidationErrors([]);
              setCsvData(validatedData);
              setCurrentStep('preview');
              toast.success(`CSV parsed successfully. ${validatedData.length} users ready for import.`);
            }
          },
          error: (error: Error) => {
            toast.error(`Error parsing CSV: ${error.message}`);
          }
        });
      } catch {
        toast.error('Error reading file');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (csvData.length === 0) return;

    setIsImporting(true);
    setCurrentStep('importing');
    setImportProgress(0);
    setImportResults([]);

    try {
      const response = await apiFetch('/api/admin/users/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ users: csvData }),
      });

      if (!response.ok) {
        throw new Error(`Import failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setImportResults(result.results || []);
        setCurrentStep('complete');
        toast.success(`Successfully imported ${result.successCount || 0} users`);
        
        // Refresh the page to show new users
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error) {
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setCurrentStep('preview');
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = 'email,firstName,lastName,role,paid\njohn.doe@university.edu,John,Doe,STUDENT,false\njane.smith@university.edu,Jane,Smith,PROFESSOR,false';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const resetModal = () => {
    setCsvData([]);
    setValidationErrors([]);
    setImportProgress(0);
    setImportResults([]);
    setCurrentStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetModal();
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Users className="h-4 w-4" />
          Bulk import
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <span className="eyebrow text-ink-faint">Onboarding</span>
          <DialogTitle>Bulk import users</DialogTitle>
        </DialogHeader>

        {currentStep === 'upload' && (
          <div className="flex flex-col gap-6">
            <section className="border border-rule rounded-md p-8 text-center bg-surface-sunken/40">
              <Upload className="h-8 w-8 mx-auto text-ink-faint mb-3" />
              <p className="font-display text-lg text-ink mb-1">Upload a CSV</p>
              <p className="text-sm text-ink-muted mb-5">
                Drag and drop a CSV file here, or click to browse.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button onClick={() => fileInputRef.current?.click()}>
                  Choose file
                </Button>
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4" />
                  Template
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </section>
          </div>
        )}

        {currentStep === 'preview' && (
          <div className="flex flex-col gap-6">
            <header className="flex items-center justify-between">
              <span className="eyebrow text-ink-faint">
                {csvData.length} users ready for import
              </span>
            </header>

            <div className="paper border border-rule rounded-md overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken/40 border-b border-rule sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-left eyebrow text-ink-faint">Email</th>
                    <th className="px-4 py-2.5 text-left eyebrow text-ink-faint">Name</th>
                    <th className="px-4 py-2.5 text-left eyebrow text-ink-faint">Role</th>
                    <th className="px-4 py-2.5 text-left eyebrow text-ink-faint">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {csvData.map((row, index) => {
                    const { role: importLegacyRole } = row;
                    return (
                    <tr key={index} className="hover:bg-surface-sunken/40">
                      <td className="px-4 py-2.5 text-ink">{row.email}</td>
                      <td className="px-4 py-2.5 text-ink-muted">
                        {row.firstName} {row.lastName}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={
                            importLegacyRole === 'ADMIN'
                              ? 'default'
                              : importLegacyRole === 'PROFESSOR'
                                ? 'info'
                                : 'outline'
                          }
                        >
                          {importLegacyRole.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={row.paid ? 'success' : 'outline'}>
                          {row.paid ? 'Yes' : 'No'}
                        </Badge>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep('upload')}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={isImporting} loading={isImporting}>
                {isImporting ? 'Importing…' : 'Start import'}
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'importing' && (
          <div className="flex flex-col gap-4 paper border border-rule rounded-md p-6">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 animate-spin text-ink-faint" />
              <span className="eyebrow text-ink-faint">Importing</span>
            </div>
            <div className="flex justify-between text-xs text-ink-faint tnum">
              <span>Progress</span>
              <span>{Math.round(importProgress)}%</span>
            </div>
            <Progress value={importProgress} />
            <p className="text-sm text-ink-muted">
              Creating users in Clerk and syncing to the database…
            </p>
          </div>
        )}

        {currentStep === 'complete' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2 eyebrow text-success-fg">
              <CheckCircle className="h-3.5 w-3.5" />
              Import complete
            </div>

            <ul className="flex flex-col gap-2">
              {importResults.map((result, index) => (
                <Alert key={index} variant={result.success ? 'default' : 'destructive'}>
                  {result.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>{result.message}</AlertDescription>
                </Alert>
              ))}
            </ul>

            <p className="text-sm text-ink-muted text-center">
              Page will refresh automatically.
            </p>

            <div className="flex justify-center">
              <Button onClick={() => handleOpenChange(false)}>Close</Button>
            </div>
          </div>
        )}

        {validationErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex flex-col gap-1">
                <span className="font-medium">Validation errors</span>
                <ul className="list-disc list-inside flex flex-col gap-0.5">
                  {validationErrors.map((error, index) => (
                    <li key={index} className="text-sm">{error}</li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
