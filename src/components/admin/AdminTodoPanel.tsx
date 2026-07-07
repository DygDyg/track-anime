"use client";

import { useCallback, useEffect, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { AdminTodoDto, AdminTodoStatus } from "@/lib/admin/todos";

const STATUS_LABELS: Record<AdminTodoStatus, string> = {
  planned: "В плане",
  in_progress: "В работе",
  done: "Готово",
};

const STATUS_BADGE: Record<AdminTodoStatus, string> = {
  planned: "bg-foreground/10 text-muted",
  in_progress: "bg-accent/15 text-accent",
  done: "bg-emerald-500/15 text-emerald-300",
};

export function AdminTodoPanel() {
  const [items, setItems] = useState<AdminTodoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [importance, setImportance] = useState(60);
  const [complexity, setComplexity] = useState(50);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/todos");
      if (!res.ok) throw new Error("load_failed");
      const data: { items: AdminTodoDto[] } = await res.json();
      setItems(data.items);
    } catch {
      setError("Не удалось загрузить список");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createItem(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, importance, complexity }),
      });
      if (!res.ok) throw new Error("create_failed");
      setTitle("");
      setDescription("");
      setImportance(60);
      setComplexity(50);
      await load();
    } catch {
      setError("Не удалось добавить задачу");
    } finally {
      setSaving(false);
    }
  }

  async function patchItem(id: string, patch: Partial<AdminTodoDto>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("patch_failed");
      await load();
    } catch {
      setError("Не удалось обновить задачу");
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(id: string, itemTitle: string) {
    if (!window.confirm(`Удалить «${itemTitle}» из плана?`)) return;

    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/todos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
      await load();
    } catch {
      setError("Не удалось удалить задачу");
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = items.filter((item) => item.status !== "done").length;

  return (
    <div className="space-y-6">
      <div className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">To-do / план разработки</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Список идей и задач, отсортированный по приоритету (важность и сложность). Присылайте планы в
          чат — новые пункты будут добавляться сюда. Реализованное удаляйте или отмечайте «Готово».
        </p>
        <p className="mt-2 text-xs text-muted">
          Активных задач: {activeCount} · приоритет = важность × 2 − сложность × 0.6
        </p>
      </div>

      <form onSubmit={(event) => void createItem(event)} className={`${adminClass.panel} space-y-4`}>
        <h3 className="text-sm font-semibold text-foreground">Добавить задачу</h3>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Название"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40"
          required
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Описание (необязательно)"
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">Важность: {importance}</span>
            <input
              type="range"
              min={1}
              max={100}
              value={importance}
              onChange={(event) => setImportance(Number(event.target.value))}
              className="mt-1 w-full accent-accent"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Сложность: {complexity}</span>
            <input
              type="range"
              min={1}
              max={100}
              value={complexity}
              onChange={(event) => setComplexity(Number(event.target.value))}
              className="mt-1 w-full accent-accent"
            />
          </label>
        </div>
        <button type="submit" disabled={saving} className={adminClass.btnPrimary}>
          {saving ? "Сохранение…" : "Добавить"}
        </button>
      </form>

      {error ? <p className={adminClass.alertError}>{error}</p> : null}

      <div className={adminClass.panel}>
        {loading ? (
          <p className="text-sm text-muted">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">Список пуст.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-border bg-background/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status]}`}
                      >
                        {STATUS_LABELS[item.status]}
                      </span>
                      <span className="text-xs text-muted">приоритет {item.score}</span>
                      <span className="text-xs text-muted">
                        важн. {item.importance} · сложн. {item.complexity}
                      </span>
                    </div>
                    <p className="mt-2 font-medium text-foreground">{item.title}</p>
                    {item.description ? (
                      <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.status === "planned" ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void patchItem(item.id, { status: "in_progress" })}
                        className={adminClass.btnSecondary}
                      >
                        {busyId === item.id ? "…" : "В работу"}
                      </button>
                    ) : null}
                    {item.status !== "done" ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void patchItem(item.id, { status: "done" })}
                        className={adminClass.btnSecondary}
                      >
                        {busyId === item.id ? "…" : "Готово"}
                      </button>
                    ) : null}
                    {item.status === "done" ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void removeItem(item.id, item.title)}
                        className={adminClass.btnSecondary}
                      >
                        {busyId === item.id ? "…" : "Удалить"}
                      </button>
                    ) : null}
                    {item.status === "in_progress" ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void patchItem(item.id, { status: "planned" })}
                        className={adminClass.btnSecondary}
                      >
                        {busyId === item.id ? "…" : "В план"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
