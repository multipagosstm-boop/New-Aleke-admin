import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, Bot, Sparkles, Paperclip, X, Loader2, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import MessageBubble from "@/components/agent/MessageBubble";
import ConversationSidebar from "@/components/agent/ConversationSidebar";
import { askAlekeAssistant } from "@/api/geminiAssistant";

const SUGGESTIONS = [
  "¿Cuántos extractos hay por pagar y cuál es el total pendiente?",
  "Muéstrame las compras por tarjeta del último mes",
  "Registrar un movimiento de libro diario",
  "Crear una nueva tarjeta de crédito"
];

const CONV_STORAGE_KEY = 'aleke_assistant_conversations';

export default function Asistente() {
  const [conversations, setConversations] = useState(() => {
    try {
      const saved = localStorage.getItem(CONV_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  // Save conversations to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(conversations));
    } catch (e) {
      console.error(e);
    }
  }, [conversations]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages = activeConv?.messages || [];

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        const base64 = await base64Promise;
        uploaded.push({
          url: base64,
          name: file.name,
          isImage: file.type.startsWith("image/"),
          type: file.type
        });
      }
      setPendingFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePending = (idx) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) images.push(file);
      }
    }
    if (images.length) {
      setUploading(true);
      (async () => {
        try {
          const uploaded = [];
          for (const file of images) {
            const reader = new FileReader();
            const base64Promise = new Promise((resolve) => {
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(file);
            });
            const base64 = await base64Promise;
            uploaded.push({
              url: base64,
              name: file.name || "imagen.png",
              isImage: true,
              type: file.type
            });
          }
          setPendingFiles((prev) => [...prev, ...uploaded]);
        } catch (err) {
          console.error(err);
        }
        setUploading(false);
      })();
    }
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleNew = () => {
    const newId = `conv_${Date.now()}`;
    const newConv = {
      id: newId,
      name: "Nueva conversación",
      created_date: new Date().toISOString(),
      messages: []
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newId);
    return newId;
  };

  const handleSend = async (text) => {
    const content = (text ?? input).trim();
    if ((!content && pendingFiles.length === 0) || sending) return;

    let targetId = activeId;
    if (!targetId) {
      targetId = handleNew();
    }

    const currentAttachments = [...pendingFiles];
    setInput("");
    setPendingFiles([]);
    setSending(true);

    const userMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: content || "(imagen adjunta)",
      file_urls: currentAttachments.map(f => f.url),
      created_date: new Date().toISOString()
    };

    // Append user message immediately
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === targetId) {
          const updatedMessages = [...(c.messages || []), userMessage];
          const name = c.name === "Nueva conversación" ? (content.slice(0, 30) || "Consulta con imagen") : c.name;
          return { ...c, name, messages: updatedMessages };
        }
        return c;
      })
    );

    // Call Gemini API
    const imageAttachment = currentAttachments.find(f => f.isImage);
    const assistantReplyText = await askAlekeAssistant({
      message: content,
      conversationHistory: messages.slice(-6),
      imageBase64: imageAttachment ? imageAttachment.url : null,
      mimeType: imageAttachment?.type || 'image/jpeg'
    });

    const assistantMessage = {
      id: `msg_${Date.now() + 1}`,
      role: "assistant",
      content: assistantReplyText,
      created_date: new Date().toISOString()
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === targetId) {
          return { ...c, messages: [...(c.messages || []), assistantMessage] };
        }
        return c;
      })
    );

    setSending(false);
  };

  const handleSuggestion = (s) => handleSend(s);

  const isStreaming = messages.length > 0 && messages[messages.length - 1]?.role === "user";

  return (
    <div className="flex h-full">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNew}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center gap-2 px-5 shrink-0 bg-card/30">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="font-heading font-semibold text-sm">Aleke Asistente</div>
            <div className="text-[10px] text-muted-foreground">Registra formularios y genera informes</div>
          </div>
          {isStreaming && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 animate-pulse text-primary" /> pensando...
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8">
          {!activeId ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <div>
                <div className="font-heading font-semibold text-lg">Hola, soy Aleke Asistente</div>
                <div className="text-sm text-muted-foreground mt-1">Puedo registrar movimientos, tarjetas, cuentas, arriendos, préstamos y generar informes.</div>
              </div>
              <Button onClick={handleNew}><Sparkles className="w-4 h-4 mr-2" /> Empezar conversación</Button>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl mt-4">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { handleNew().then(() => setTimeout(() => handleSuggestion(s), 300)); }}
                    className="text-xs px-3 py-2 rounded-full border border-border bg-card hover:bg-muted hover:border-primary/30 transition-colors text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center py-12">
              <div className="text-sm text-muted-foreground">Escribe un mensaje para empezar.</div>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="text-xs px-3 py-2 rounded-full border border-border bg-card hover:bg-muted hover:border-primary/30 transition-colors text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto pb-4">
              {messages.map((m, idx) => <MessageBubble key={idx} message={m} />)}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        {activeId && (
          <div className="border-t border-border p-4 shrink-0 bg-card/30">
            <div className="max-w-3xl mx-auto">
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingFiles.map((f, idx) => (
                    <div key={idx} className="relative group">
                      {f.isImage ? (
                        <img src={f.url} alt={f.name} className="w-16 h-16 rounded-md object-cover border border-border" />
                      ) : (
                        <div className="w-16 h-16 rounded-md border border-border flex items-center justify-center bg-muted">
                          <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <button
                        onClick={() => removePending(idx)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow hover:bg-destructive/90"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || uploading}
                  title="Adjuntar imagen"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </Button>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  onPaste={handlePaste}
                  placeholder="Escribe tu mensaje o adjunta un voucher... (Enter para enviar)"
                  disabled={sending}
                  className="flex-1"
                />
                <Button onClick={() => handleSend()} disabled={sending || (!input.trim() && pendingFiles.length === 0)}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}