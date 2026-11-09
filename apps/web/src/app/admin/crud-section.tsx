'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { ZodType, ZodTypeDef } from 'zod';
import { t } from '@/i18n';
import { Button, IconButton } from '@/components/ui/button';
import { Dialog, Field, SelectField, Skeleton, Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import s from './admin.module.css';

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  options?: { value: string; label: string }[];
  optional?: boolean;
}

export interface Column<T> {
  label: string;
  render: (row: T) => React.ReactNode;
}

interface Props<T extends { id: string }, B> {
  queryKey: string;
  list: () => Promise<T[]>;
  create: (b: B) => Promise<unknown>;
  update: (id: string, b: B) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  columns: Column<T>[];
  fields: FieldDef[];
  schema: ZodType<B, ZodTypeDef, unknown>;
  toValues: (row: T | null) => Record<string, string | boolean>;
  titleNew: string;
  titleEdit: string;
  rowName: (row: T) => string;
}

/** Generic list + create/edit/delete for admin curation tables. Bodies are validated with the shared Zod schemas. */
export function CrudSection<T extends { id: string }, B>(props: Props<T, B>) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', props.queryKey], queryFn: props.list });
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<T | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', props.queryKey] });
  const save = useMutation({
    mutationFn: (b: B) => (editing && editing !== 'new' ? props.update(editing.id, b) : props.create(b)),
    onSuccess: () => {
      void refresh();
      setEditing(null);
      toast({ message: t('admin.savedToast') });
    },
    onError: () => toast({ message: t('common.errorGeneric') }),
  });
  const del = useMutation({
    mutationFn: (id: string) => props.remove(id),
    onSuccess: () => {
      void refresh();
      setDeleting(null);
      toast({ message: t('admin.deletedToast') });
    },
  });

  const open = (row: T | 'new') => {
    setEditing(row);
    setValues(props.toValues(row === 'new' ? null : row));
    setErrors({});
  };

  const submit = () => {
    const raw: Record<string, unknown> = {};
    for (const f of props.fields) {
      const v = values[f.name];
      if (f.type === 'checkbox') raw[f.name] = Boolean(v);
      else if (f.type === 'number') raw[f.name] = v === '' || v === undefined ? undefined : Number(String(v).replace(',', '.'));
      else raw[f.name] = v === '' && f.optional ? null : v;
    }
    const r = props.schema.safeParse(raw);
    if (!r.success) {
      const errs: Record<string, string> = {};
      for (const issue of r.error.issues) errs[String(issue.path[0])] = t('admin.invalid');
      setErrors(errs);
      return;
    }
    save.mutate(r.data);
  };

  return (
    <div className={s.crud}>
      <div className={s.crudHead}>
        <Button onClick={() => open('new')}>
          <Plus size={18} aria-hidden="true" /> {t('admin.new')}
        </Button>
      </div>
      {!q.data ? (
        <Skeleton height="calc(var(--space-20) * 2)" />
      ) : q.data.length === 0 ? (
        <p className={s.muted}>{t('admin.empty')}</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                {props.columns.map((c) => (
                  <th key={c.label} scope="col">
                    {c.label}
                  </th>
                ))}
                <th scope="col">
                  <span className="visually-hidden">{t('admin.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((row) => (
                <tr key={row.id}>
                  {props.columns.map((c) => (
                    <td key={c.label}>{c.render(row)}</td>
                  ))}
                  <td className={s.rowActions}>
                    <IconButton label={`${t('common.edit')}: ${props.rowName(row)}`} onClick={() => open(row)}>
                      <Pencil size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton label={`${t('common.delete')}: ${props.rowName(row)}`} onClick={() => setDeleting(row)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? props.titleNew : props.titleEdit}
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className={s.formGrid}>
          {props.fields.map((f) =>
            f.type === 'select' ? (
              <SelectField key={f.name} label={f.label} value={String(values[f.name] ?? '')} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                {f.optional ? <option value="">—</option> : null}
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectField>
            ) : f.type === 'checkbox' ? (
              <Switch key={f.name} label={f.label} checked={Boolean(values[f.name])} onChange={(v) => setValues({ ...values, [f.name]: v })} />
            ) : (
              <Field
                key={f.name}
                label={f.label}
                type={f.type === 'date' ? 'date' : 'text'}
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                value={String(values[f.name] ?? '')}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                error={errors[f.name] ?? null}
              />
            ),
          )}
        </div>
        {Object.keys(errors).length > 0 ? <p className={s.error}>{t('admin.invalid')}</p> : null}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? t('admin.confirmDelete', { name: props.rowName(deleting) }) : ''}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => deleting && del.mutate(deleting.id)} loading={del.isPending}>
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  );
}
