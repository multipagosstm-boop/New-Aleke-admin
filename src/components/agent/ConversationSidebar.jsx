import React from "react";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ConversationSidebar({ conversations, activeId, onSelect, onNew, onDelete }) {
  return (
    <div className="w-64 shrink-0 border-r border-border bg-card/50 flex flex-col">
      <div className="p-3 border-b border-border">
        <Button onClick={onNew} className="w-full" size="sm">
          <Plus className="w-4 h-4 mr-2" /> Nueva conversación
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">No hay conversaciones</div>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors",
                activeId === c.id ? "bg-primary/15 text-primary font-medium" : "hover:bg-muted text-foreground"
              )}
              onClick={() => onSelect(c.id)}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 truncate">{c.metadata?.name || c.metadata?.description || "Conversación"}</span>
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  title="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}