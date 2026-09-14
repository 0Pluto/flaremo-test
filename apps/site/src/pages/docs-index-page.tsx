import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { docPath, getDocNavGroups } from "@/content/docs-nav";
import { listDocs } from "@/lib/docs-source.generated";
import { getLocaleFromPath, type SupportedLocale } from "@/lib/seo";

const HEADINGS: Record<SupportedLocale, string> = {
  en: "Documentation",
  zh: "文档总览",
  ja: "ドキュメント総覧",
  fr: "Documentation",
  es: "Documentación",
  ko: "문서 개요",
  ru: "Обзор документации",
  ar: "نظرة عامة على المستندات",
};

export function DocsIndexPage() {
  const { pathname } = useLocation();
  const locale = getLocaleFromPath(pathname);
  const docLocale = locale === "zh" ? "zh-CN" : "en-US";
  const docs = useMemo(() => listDocs(docLocale), [docLocale]);
  const groups = useMemo(() => getDocNavGroups(locale), [locale]);

  return (
    <main className="container-x py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {HEADINGS[locale] || HEADINGS.en}
        </h1>
      </header>
      <div className="space-y-10">
        {groups.map((group) => {
          const docsInGroup = docs.filter((d) => d.group === group.id);
          if (docsInGroup.length === 0) return null;
          return (
            <section key={group.id}>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h2>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-background shadow-xs">
                {docsInGroup.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      className="group flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-accent/40"
                      to={docPath(doc.slug, locale)}
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-semibold tracking-tight text-foreground">
                          {doc.title}
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
