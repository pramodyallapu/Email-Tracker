"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { CompanyGroup } from "@/lib/mail/company-contacts";
import Link from "next/link";
import { useState } from "react";

function emptyCompany(): CompanyGroup {
  return { companyName: "", emails: [""] };
}

export function CompanyContactsForm({
  initialCompanies,
}: {
  initialCompanies: CompanyGroup[];
}) {
  const [companies, setCompanies] = useState<CompanyGroup[]>(
    initialCompanies.length > 0 ? initialCompanies : [emptyCompany()]
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const updateCompanyName = (index: number, companyName: string) => {
    setCompanies((prev) =>
      prev.map((c, i) => (i === index ? { ...c, companyName } : c))
    );
  };

  const updateEmail = (companyIndex: number, emailIndex: number, email: string) => {
    setCompanies((prev) =>
      prev.map((c, i) => {
        if (i !== companyIndex) return c;
        const emails = [...c.emails];
        emails[emailIndex] = email;
        return { ...c, emails };
      })
    );
  };

  const addEmail = (companyIndex: number) => {
    setCompanies((prev) =>
      prev.map((c, i) =>
        i === companyIndex ? { ...c, emails: [...c.emails, ""] } : c
      )
    );
  };

  const removeEmail = (companyIndex: number, emailIndex: number) => {
    setCompanies((prev) =>
      prev.map((c, i) => {
        if (i !== companyIndex) return c;
        const emails = c.emails.filter((_, j) => j !== emailIndex);
        return { ...c, emails: emails.length > 0 ? emails : [""] };
      })
    );
  };

  const addCompany = () => {
    setCompanies((prev) => [...prev, emptyCompany()]);
  };

  const removeCompany = (index: number) => {
    setCompanies((prev) =>
      prev.length <= 1 ? [emptyCompany()] : prev.filter((_, i) => i !== index)
    );
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setIsError(false);

    const payload = companies
      .map((c) => ({
        companyName: c.companyName.trim(),
        emails: c.emails.map((e) => e.trim()).filter(Boolean),
      }))
      .filter((c) => c.companyName || c.emails.length > 0);

    const res = await fetch("/api/settings/company-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companies: payload }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setIsError(true);
      setMessage(data.error ?? "Failed to save companies.");
      return;
    }

    const saved = (data.companies as CompanyGroup[] | undefined) ?? [];
    setCompanies(saved.length > 0 ? saved : [emptyCompany()]);
    const invalid = (data.invalid as string[] | undefined) ?? [];
    setMessage(
      invalid.length > 0
        ? `Saved. Skipped invalid emails: ${invalid.join(", ")}`
        : "Companies saved."
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Companies</CardTitle>
        <p className="text-sm text-gray-500">
          Add a company name and the full email addresses for people at that
          company. Threads appear on the{" "}
          <Link href="/dashboard/companies" className="text-indigo-600 hover:underline">
            Companies report
          </Link>{" "}
          when you email one of these contacts. Contact domains cannot overlap
          Internal domains.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {companies.map((company, companyIndex) => (
          <div
            key={companyIndex}
            className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <label
                  htmlFor={`company-name-${companyIndex}`}
                  className="mb-1 block text-xs font-medium text-gray-600"
                >
                  Company name
                </label>
                <input
                  id={`company-name-${companyIndex}`}
                  type="text"
                  value={company.companyName}
                  onChange={(e) => updateCompanyName(companyIndex, e.target.value)}
                  placeholder="TherapyPMS"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>
              {companies.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCompany(companyIndex)}
                  className="mt-5 text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Contact emails</p>
              {company.emails.map((email, emailIndex) => (
                <div key={emailIndex} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) =>
                      updateEmail(companyIndex, emailIndex, e.target.value)
                    }
                    placeholder="john@therapypms.com"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    aria-label={`Email ${emailIndex + 1} for ${company.companyName || "company"}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeEmail(companyIndex, emailIndex)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-white"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addEmail(companyIndex)}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                + Add email
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addCompany}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          + Add company
        </button>

        <Button onClick={save} loading={saving}>
          Save companies
        </Button>
        {message && (
          <p
            className={`text-sm ${isError ? "text-red-600" : "text-gray-600"}`}
            role="status"
          >
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
