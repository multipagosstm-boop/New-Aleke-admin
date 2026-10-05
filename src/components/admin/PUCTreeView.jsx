import React, { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, CheckCircle2, Pencil, Trash2, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

const CLASE_BG = {
  1: "bg-primary/10",
  2: "bg-destructive/10",
  3: "bg-success/10",
  4: "bg-success/10",
  5: "bg-destructive/10",
  6: "bg-warning/10",
};

const CHILD_LABEL = {
  Clase: "grupos",
  Grupo: "cuentas",
  Cuenta: "subcuentas",
  Subcuenta: "auxiliares",
};

function getParentCode(cuenta) {
  const code = cuenta.codigo;
  switch (cuenta.nivel) {
    case "Clase": return null;
    case "Grupo": return Math.floor(code / 10);
    case "Cuenta": return Math.floor(code / 100);
    case "Subcuenta": return Math.floor(code / 100);
    case "Auxiliar": return Math.floor(code / 100);
    default: return null;
  }
}

function findClosestAncestor(cuenta, codeSet) {
  if (cuenta.nivel === "Clase") return null;
  let parentCode = getParentCode(cuenta);
  while (parentCode !== null && parentCode > 0) {
    if (codeSet.has(parentCode) || codeSet.has(String(parentCode))) return parentCode;
    const digits = String(parentCode).length;
    if (digits > 2) parentCode = Math.floor(parentCode / 100);
    else if (digits === 2) parentCode = Math.floor(parentCode / 10);
    else break;
  }
  return null;
}

function buildTree(accounts) {
  if (!accounts || !Array.isArray(accounts)) return [];

  // Deduplicate incoming accounts by ID and by codigo
  const seenIds = new Set();
  const seenCodes = new Set();
  const uniqueAccounts = [];

  for (const a of accounts) {
    if (!a || a.codigo === undefined || a.codigo === null) continue;
    const idKey = a.id ? String(a.id) : null;
    const codeKey = String(a.codigo);

    if (idKey && seenIds.has(idKey)) continue;
    if (seenCodes.has(codeKey)) continue;

    if (idKey) seenIds.add(idKey);
    seenCodes.add(codeKey);
    uniqueAccounts.push(a);
  }

  const sorted = [...uniqueAccounts].sort((a, b) => Number(a.codigo) - Number(b.codigo));
  const codeMap = new Map();
  sorted.forEach((a) => {
    codeMap.set(String(a.codigo), { data: a, children: [] });
  });

  const codeSet = new Set(sorted.map((a) => String(a.codigo)));
  const roots = [];

  // Iterate strictly once per unique account node
  for (const node of codeMap.values()) {
    const parentCode = findClosestAncestor(node.data, codeSet);
    if (parentCode !== null && codeMap.has(String(parentCode))) {
      const parentNode = codeMap.get(String(parentCode));
      if (!parentNode.children.includes(node)) {
        parentNode.children.push(node);
      }
    } else {
      if (!roots.includes(node)) {
        roots.push(node);
      }
    }
  }

  return roots;
}

function filterNodes(nodes, predicate, autoExpand) {
  const result = [];
  const seenCodes = new Set();

  nodes.forEach((node) => {
    const codeKey = String(node.data.codigo);
    if (seenCodes.has(codeKey)) return;

    const selfMatch = predicate(node.data);
    const filteredChildren = filterNodes(node.children, predicate, autoExpand);
    if (selfMatch || filteredChildren.length > 0) {
      seenCodes.add(codeKey);
      if (filteredChildren.length > 0) autoExpand.add(node.data.codigo);
      result.push({ ...node, children: filteredChildren });
    }
  });
  return result;
}

function collectCodes(nodes, acc) {
  nodes.forEach((node) => {
    if (node.children.length > 0) {
      acc.add(node.data.codigo);
      collectCodes(node.children, acc);
    }
  });
  return acc;
}

function TreeRow({ node, depth, expanded, onToggle, onEdit, onDelete }) {
  const d = node.data;
  const isExpanded = expanded.has(d.codigo);
  const hasChildren = node.children.length > 0;
  const isClase = d.nivel === "Clase";
  const indent = depth * 24 + 12;

  return (
    <>
      <div
        className={`flex items-center gap-2 py-2.5 border-b border-border/30 hover:bg-muted/30 transition-colors ${isClase ? (CLASE_BG[d.clase] || "bg-muted/20") : ""}`}
        style={{ paddingLeft: `${indent}px`, paddingRight: "12px" }}
      >
        <button
          onClick={() => hasChildren && onToggle(d.codigo)}
          className="w-5 h-5 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : null}
        </button>
        <span className="font-mono text-xs text-muted-foreground min-w-[70px]">{d.codigo}</span>
        <span className={`flex-1 text-sm ${d.es_transaccional ? "font-medium" : "text-muted-foreground"}`}>
          {d.concepto}
        </span>
        {isClase && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Naturaleza: {d.naturaleza === "Débito" ? "deudora" : "acreedora"}
          </span>
        )}
        {hasChildren && (
          <span className="text-xs text-muted-foreground shrink-0">
            {node.children.length} {CHILD_LABEL[d.nivel] || ""}
          </span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/admin/contabilidad/detalle-cuentas?cuenta=${d.codigo}`}
            className="text-muted-foreground hover:text-primary p-1 rounded inline-flex items-center"
            title={`Ver detalle de movimientos de la cuenta ${d.codigo}`}
          >
            <ReceiptText className="w-3.5 h-3.5" />
          </Link>
          {onEdit && (
            <button
              onClick={() => onEdit(d)}
              className="text-muted-foreground hover:text-primary p-1 rounded"
              title="Editar cuenta"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && !hasChildren && !isClase && (
            <button
              onClick={() => onDelete(d)}
              className="text-muted-foreground hover:text-destructive p-1 rounded"
              title="Eliminar cuenta"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {d.es_transaccional && <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
          {!hasChildren && <Badge variant="outline" className="text-[10px]">{d.tipo_estado}</Badge>}
        </div>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child, idx) => (
            <TreeRow
              key={child.data?.id ? `puc-child-${child.data.id}` : `puc-child-${child.data?.codigo}-${idx}`}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function PUCTreeView({ cuentas, filters, onEdit, onDelete }) {
  const [userExpanded, setUserExpanded] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e?.response?.data?.error || e?.message || "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const { tree, autoExpand } = useMemo(() => {
    const fullTree = buildTree(cuentas);
    if (!filters) return { tree: fullTree, autoExpand: new Set() };
    const ae = new Set();
    const filtered = filterNodes(fullTree, filters, ae);
    return { tree: filtered, autoExpand: ae };
  }, [cuentas, filters]);

  const effectiveExpanded = useMemo(
    () => new Set([...userExpanded, ...autoExpand]),
    [userExpanded, autoExpand]
  );

  const toggle = useCallback((code) => {
    setUserExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setUserExpanded(collectCodes(tree, new Set()));
  }, [tree]);

  const collapseAll = useCallback(() => {
    setUserExpanded(new Set());
  }, []);

  return (
    <div>
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-border/30">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={expandAll}>
          Expandir todo
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={collapseAll}>
          Colapsar todo
        </Button>
      </div>
      <div>
        {tree.map((node, idx) => (
          <TreeRow
            key={node.data?.id ? `puc-root-${node.data.id}` : `puc-root-${node.data?.codigo}-${idx}`}
            node={node}
            depth={0}
            expanded={effectiveExpanded}
            onToggle={toggle}
            onEdit={onEdit}
            onDelete={onDelete ? setDeleteTarget : null}
          />
        ))}
        {tree.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No hay cuentas que coincidan con los filtros.
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(_open) => { if (!deleting) { setDeleteTarget(null); setDeleteError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cuenta del PUC?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Se eliminará la cuenta{" "}
                  <span className="font-mono font-medium">{deleteTarget.codigo}</span> —{" "}
                  <span className="font-medium">{deleteTarget.concepto}</span> del plan de cuentas.
                  Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{deleteError}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminando..." : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}