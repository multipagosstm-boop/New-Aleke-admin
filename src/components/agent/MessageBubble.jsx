import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { Image } from "@/components/ui/image";

const STATUS_META = {
  pending: { icon: Loader2, label: "Pendiente", spin: true, color: "text-muted-foreground" },
  running: { icon: Loader2, label: "Ejecutando", spin: true, color: "text-primary" },
  in_progress: { icon: Loader2, label: "En progreso", spin: true, color: "text-primary" },
  completed: { icon: CheckCircle2, label: "Completado", spin: false, color: "text-success" },
  success: { icon: CheckCircle2, label: "Exitoso", spin: false, color: "text-success" },
  failed: { icon: XCircle, label: "Fallido", spin: false, color: "text-destructive" },
  error: { icon: XCircle, label: "Error", spin: false, color: "text-destructive" }
};

function FunctionDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const status = toolCall.status || "pending";
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;
  const hideDetails = toolCall.display_projection?.hide_details && toolCall.display_projection?.details_redacted;

  let parsedArgs = toolCall.arguments_string;
  try { parsedArgs = JSON.parse(toolCall.arguments_string); } catch { /* keep raw */ }

  let parsedResults = toolCall.results;
  if (typeof parsedResults === "string") {
    try { parsedResults = JSON.parse(parsedResults); } catch { /* keep raw */ }
  }

  const isFailed = status === "failed" || status === "error" ||
    (typeof parsedResults === "object" && parsedResults && (parsedResults.success === false || /error|failed/i.test(JSON.stringify(parsedResults))));

  const displayLabel = hideDetails
    ? (isFailed ? (toolCall.display_projection?.error_label || meta.label) : (status === "success" || status === "completed" ? toolCall.display_projection?.label : toolCall.display_projection?.active_label || meta.label))
    : meta.label;

  return (
    <div className="mt-2 text-xs border border-border rounded-md bg-muted/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/60 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        <Icon className={cn("w-3.5 h-3.5", meta.color, meta.spin && "animate-spin")} />
        <span className="font-medium">{toolCall.name || "herramienta"}</span>
        <span className={cn("ml-auto", isFailed ? "text-destructive" : meta.color)}>{displayLabel}</span>
      </button>
      {!hideDetails && expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border">
          {parsedArgs && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Parámetros</div>
              <pre className="text-[11px] font-mono bg-background rounded p-2 overflow-x-auto max-h-40">{typeof parsedArgs === "string" ? parsedArgs : JSON.stringify(parsedArgs, null, 2)}</pre>
            </div>
          )}
          {parsedResults !== undefined && parsedResults !== null && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Resultado</div>
              <pre className={cn("text-[11px] font-mono bg-background rounded p-2 overflow-x-auto max-h-48", isFailed && "border border-destructive/30")}>{typeof parsedResults === "string" ? parsedResults : JSON.stringify(parsedResults, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3 py-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", isUser ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={cn("flex-1 min-w-0 max-w-[85%]", isUser ? "flex flex-col items-end" : "flex flex-col items-start")}>
        {message.content && (
          isUser
            ? <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm whitespace-pre-wrap">{message.content}</div>
            : <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-2.5 text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-pre:bg-muted prose-pre:text-xs">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
        )}
        {message.file_urls?.length > 0 && (
          <div className={cn("flex flex-wrap gap-2 mt-2", isUser ? "justify-end" : "justify-start")}>
            {message.file_urls.map((url, idx) => {
              const isImg = /\.(png|jpe?g|webp|gif|bmp)$/i.test(url) || url.includes("image");
              return isImg ? (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  <Image
                    src={url}
                    alt={`adjunto ${idx + 1}`}
                    className="w-40 h-40 rounded-lg border border-border object-cover"
                    fittingType="fill"
                  />
                </a>
              ) : (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-2 rounded-md border border-border bg-muted hover:bg-accent transition-colors">
                  Ver archivo adjunto
                </a>
              );
            })}
          </div>
        )}
        {message.tool_calls?.map((tc, idx) => <FunctionDisplay key={idx} toolCall={tc} />)}
      </div>
    </div>
  );
}