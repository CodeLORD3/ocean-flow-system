import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MermaidBlock({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          securityLevel: "strict",
          fontFamily: "inherit",
        });
        const { svg } = await mermaid.render(`m${id}`, chart);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Diagrammet kunde inte ritas");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-md border border-destructive/40 bg-muted p-3 text-xs">
        {error}
        {"\n\n"}
        {chart}
      </pre>
    );
  }

  return <div ref={ref} className="my-4 overflow-x-auto rounded-md border bg-card p-3 [&_svg]:h-auto [&_svg]:max-w-full" />;
}

export function MarkdownDoc({ source }: { source: string }) {
  return (
    <div className="max-w-none space-y-1 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 mt-2 text-2xl font-bold tracking-tight">{children}</h1>,
          h2: ({ children }) => (
            <h2 className="mb-3 mt-8 border-b pb-1 text-xl font-semibold tracking-tight">{children}</h2>
          ),
          h3: ({ children }) => <h3 className="mb-2 mt-6 text-base font-semibold">{children}</h3>,
          p: ({ children }) => <p className="my-3 text-muted-foreground">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5 text-muted-foreground">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          hr: () => <hr className="my-8" />,
          a: ({ children, href }) => (
            <a href={href} className="text-primary underline" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-md border">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b px-2 py-1.5 text-left align-top font-semibold whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => <td className="border-b px-2 py-1.5 align-top">{children}</td>,
          code: ({ className, children }) => {
            const text = String(children ?? "");
            if (/language-mermaid/.test(className ?? "")) {
              return <MermaidBlock chart={text.replace(/\n$/, "")} />;
            }
            return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">{children}</code>;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownDoc;
