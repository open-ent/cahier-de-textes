import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragEvent, FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { useDiaryContext } from '../hooks/useDiaryContext';
import {
  buildTree,
  deletionIds,
  draftFromSession,
  flatten,
  MAX_DEPTH,
  parentChoices,
  ProgressionFolder,
  ProgressionSession,
  searchTree,
  toBody,
} from '../progressions';
import { Modal } from './Modal';
import { LoadError } from '../components/LoadError';

type Dialog = { kind: 'folder'; folder: ProgressionFolder | null } | { kind: 'delete' } | { kind: 'move' } | null;

/** Éléments déplaçables : séances (identifiants cochés ou celle saisie) et dossiers. */
const DRAG_TYPE = 'application/x-diary-progression';

/**
 * Progressions de l'enseignant, comme l'AngularJS (progression/progression-view.html) : arbre de
 * dossiers (5 niveaux au plus), séances modèles du dossier ouvert, sous-dossiers, recherche par
 * titre, création, modification, déplacement (menu ou glisser-déposer) et suppression (dossier
 * seul ou avec son contenu). Ex. « Cycle 3 › Géométrie › Angles ».
 */
export function Progressions() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const qc = useQueryClient();
  const ownerId = ctx.userId;
  const rootTitle = t('diary.progressions.root', { defaultValue: 'Mes dossiers' });

  const query = useQuery({ queryKey: ['diary', 'progression-folders', ownerId], queryFn: () => api.getProgressionFolders(ownerId), enabled: !!ownerId });
  const root = useMemo(() => buildTree(query.data ?? [], rootTitle), [query.data, rootTitle]);
  const all = useMemo(() => flatten(root), [root]);

  const [openId, setOpenId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number | null>>(new Set([null]));
  const [search, setSearch] = useState('');
  const [checkedSessions, setCheckedSessions] = useState<number[]>([]);
  const [checkedFolders, setCheckedFolders] = useState<number[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);

  const current = all.find((f) => f.id === openId) ?? root;
  const found = useMemo(() => searchTree(root, search), [root, search]);
  const searching = search.trim() !== '';
  const refresh = () => qc.invalidateQueries({ queryKey: ['diary', 'progression-folders', ownerId] });
  const ok = (text: string) => setNotice({ kind: 'success', text });
  const ko = (text: string) => setNotice({ kind: 'danger', text });

  const sessionsShown: ProgressionSession[] = searching ? found.sessions : current.sessions;
  const foldersShown: ProgressionFolder[] = searching ? found.folders.filter((f) => f.id !== null) : current.children;
  const folderTitle = (id: number | null) => all.find((f) => f.id === id)?.title ?? rootTitle;

  const open = (id: number | null) => {
    setOpenId(id);
    setCheckedSessions([]);
    setCheckedFolders([]);
    setSearch('');
    // Le dossier ouvert et ses parents sont dépliés dans l'arbre.
    setExpanded((prev) => {
      const next = new Set(prev);
      let f = all.find((x) => x.id === id);
      // La racine (id nul) est son propre parent : on s'arrête dessus, sinon la boucle ne finit jamais.
      while (f) {
        next.add(f.id);
        f = f.id === null ? undefined : all.find((x) => x.id === f!.parentId);
      }
      return next;
    });
  };
  const toggle = (id: number | null) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ── Actions ────────────────────────────────────────────────────────────────
  const saveFolder = useMutation({
    mutationFn: (v: { id: number | null; title: string; parentId: number | null }) => api.saveProgressionFolder(v.id, ownerId, v.title, v.parentId),
    onSuccess: (_r, v) => { ok(v.id ? t('diary.progression.folder.updated', { defaultValue: 'Dossier modifié' }) : t('diary.progression.folder.created', { defaultValue: 'Dossier créé' })); setDialog(null); setCheckedFolders([]); void refresh(); },
    onError: () => ko(t('diary.progression.folder.error', { defaultValue: "L'enregistrement du dossier a échoué." })),
  });
  const remove = useMutation({
    mutationFn: async (deep: boolean) => {
      const folders = all.filter((f) => f.id !== null && checkedFolders.includes(f.id));
      const ids = deletionIds(folders, deep);
      const sessions = [...new Set([...checkedSessions, ...ids.sessionIds])];
      if (sessions.length) await api.deleteProgressions(ownerId, sessions);
      if (ids.folderIds.length) await api.deleteProgressionFolders(ownerId, ids.folderIds);
    },
    onSuccess: () => { ok(t('diary.progression.deleted', { defaultValue: 'Suppression effectuée' })); setDialog(null); setCheckedFolders([]); setCheckedSessions([]); void refresh(); },
    onError: () => ko(t('diary.progression.delete.error', { defaultValue: 'La suppression a échoué.' })),
  });
  const move = useMutation({
    mutationFn: async (v: { sessions: number[]; folders: number[]; target: number | null }) => {
      const byId = new Map(all.flatMap((f) => f.sessions).map((s) => [s.id, s]));
      for (const id of v.sessions) {
        const s = byId.get(id);
        if (!s) continue;
        // Le serveur remplace la séance : on renvoie tout (devoirs inclus), seul le dossier change.
        const draft = draftFromSession(s);
        await api.saveProgression(id, toBody({ ...draft, folderId: v.target }, ownerId));
      }
      for (const id of v.folders) {
        const f = all.find((x) => x.id === id);
        if (f) await api.saveProgressionFolder(id, ownerId, f.title, v.target);
      }
    },
    onSuccess: () => { ok(t('diary.progression.moved', { defaultValue: 'Déplacement effectué' })); setDialog(null); setCheckedFolders([]); setCheckedSessions([]); void refresh(); },
    onError: () => ko(t('diary.progression.move.error', { defaultValue: 'Le déplacement a échoué.' })),
  });

  // ── Glisser-déposer ────────────────────────────────────────────────────────
  const onDragStart = (e: DragEvent, kind: 'session' | 'folder', id: number) => {
    const sessions = kind === 'session' ? (checkedSessions.includes(id) ? checkedSessions : [id]) : [];
    const folders = kind === 'folder' ? (checkedFolders.includes(id) ? checkedFolders : [id]) : [];
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ sessions, folders }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDrop = (e: DragEvent, target: ProgressionFolder) => {
    e.preventDefault();
    let payload: { sessions: number[]; folders: number[] };
    try { payload = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)); } catch { return; }
    // Un dossier ne peut pas être déposé dans lui-même ni dans l'un de ses descendants (cycle).
    const folders = payload.folders.filter((fid) => { const f = all.find((x) => x.id === fid); return f && !flatten(f).some((d) => d.id === target.id); });
    if (!payload.sessions.length && !folders.length) return;
    move.mutate({ sessions: payload.sessions, folders, target: target.id });
  };
  const dropProps = (target: ProgressionFolder) => ({ onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => onDrop(e, target) });

  const hasFolderSelected = checkedFolders.length > 0;
  const hasSessionSelected = checkedSessions.length > 0;
  const treeFolder = (f: ProgressionFolder): JSX.Element => (
    <li key={f.id ?? 'root'} role="treeitem" aria-expanded={f.children.length ? expanded.has(f.id) : undefined} aria-selected={f.id === current.id} data-folder={f.id ?? 'root'}>
      <div className="d-flex align-items-center gap-4" {...dropProps(f)} style={{ paddingLeft: f.deepStep * 14 }}>
        {f.children.length > 0 ? (
          <button type="button" className="btn btn-link p-0" aria-label={`${expanded.has(f.id) ? t('diary.progressions.collapse', { defaultValue: 'Replier' }) : t('diary.progressions.expand', { defaultValue: 'Déplier' })} ${f.title}`} onClick={() => toggle(f.id)}>
            {expanded.has(f.id) ? '▾' : '▸'}
          </button>
        ) : (
          <span style={{ width: 14 }} />
        )}
        <button type="button" className={`btn btn-link p-0 text-start ${f.id === current.id && !searching ? 'fw-bold' : ''}`} onClick={() => open(f.id)}>
          {f.title}
        </button>
      </div>
      {f.children.length > 0 && expanded.has(f.id) && <ul role="group" className="list-unstyled m-0">{f.children.map(treeFolder)}</ul>}
    </li>
  );

  if (ctx.ready && !ctx.structure) {
    return <div className="alert alert-info" role="alert">{t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-12 mb-16">
        <h1 className="m-0">{t('diary.progressions.title', { defaultValue: 'Progressions' })}</h1>
        <Link className="btn btn-primary" to={`/progression/nouvelle${current.id !== null ? `?dossier=${current.id}` : ''}`}>
          {t('diary.progression.create', { defaultValue: 'Créer une progression' })}
        </Link>
      </div>
      {notice && <div className={`alert alert-${notice.kind}`} role={notice.kind === 'danger' ? 'alert' : 'status'} data-notice>{notice.text}</div>}

      <div className="d-flex gap-24 flex-wrap">
        <aside style={{ width: 280, flex: '0 0 280px' }} aria-label={t('diary.progressions.tree', { defaultValue: 'Dossiers' })}>
          <label htmlFor="pr-search" className="visually-hidden">{t('diary.progressions.search', { defaultValue: 'Rechercher' })}</label>
          <input id="pr-search" className="form-control mb-12" placeholder={t('diary.progressions.search', { defaultValue: 'Rechercher' })} value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul role="tree" className="list-unstyled m-0 mb-12" data-tree>{treeFolder(root)}</ul>
          <button type="button" className="btn btn-secondary" disabled={current.deepStep >= MAX_DEPTH} onClick={() => setDialog({ kind: 'folder', folder: null })}>
            {t('diary.progression.folder.create', { defaultValue: 'Créer un nouveau dossier' })}
          </button>
          {current.deepStep >= MAX_DEPTH && <div className="text-muted mt-4" style={{ fontSize: 13 }}>{t('diary.progression.folder.depth', { defaultValue: 'Cinq niveaux de dossiers au plus.' })}</div>}
        </aside>

        <section style={{ flex: 1, minWidth: 320 }} aria-live="polite">
          <h2 style={{ fontSize: 18, fontWeight: 700 }} className="mb-12" data-current-folder>
            {searching ? t('diary.progressions.results', { defaultValue: 'Résultats de la recherche' }) : current.title}
          </h2>

          {(hasFolderSelected || hasSessionSelected) && (
            <div className="d-flex gap-8 mb-12 flex-wrap" role="toolbar" aria-label={t('diary.progressions.actions', { defaultValue: 'Actions sur la sélection' })} data-toolbar>
              {checkedFolders.length === 1 && !hasSessionSelected && (
                <button type="button" className="btn btn-secondary" onClick={() => setDialog({ kind: 'folder', folder: all.find((f) => f.id === checkedFolders[0]) ?? null })}>{t('diary.progression.folder.update', { defaultValue: 'Modifier le dossier' })}</button>
              )}
              {hasSessionSelected && !hasFolderSelected && <button type="button" className="btn btn-secondary" onClick={() => setDialog({ kind: 'move' })}>{t('diary.progression.move', { defaultValue: 'Déplacer' })}</button>}
              <button type="button" className="btn btn-danger" onClick={() => setDialog({ kind: 'delete' })}>{t('diary.progression.delete', { defaultValue: 'Supprimer' })}</button>
            </div>
          )}

          {foldersShown.length > 0 && (
            <ul className="list-unstyled d-flex flex-wrap gap-12 mb-16" data-subfolders>
              {foldersShown.map((f) => (
                <li key={f.id} className="card p-12 d-flex flex-row align-items-center gap-8" draggable onDragStart={(e) => onDragStart(e, 'folder', f.id!)} {...dropProps(f)} data-subfolder={f.id}>
                  <input type="checkbox" aria-label={`${t('diary.progression.select', { defaultValue: 'Sélectionner' })} ${f.title}`} checked={checkedFolders.includes(f.id!)} onChange={(e) => setCheckedFolders(e.target.checked ? [...checkedFolders, f.id!] : checkedFolders.filter((x) => x !== f.id))} />
                  <button type="button" className="btn btn-link p-0" onClick={() => open(f.id)} onDoubleClick={() => open(f.id)}>{f.title}</button>
                </li>
              ))}
            </ul>
          )}

          {query.isLoading && <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>}
          <LoadError failed={query.isError} />
          {!query.isLoading && !query.isError && sessionsShown.length === 0 && foldersShown.length === 0 && <p className="text-muted">{t('diary.progressions.empty', { defaultValue: 'Aucune progression dans ce dossier.' })}</p>}
          {sessionsShown.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="table table-bordered mb-0" data-sessions>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" aria-label={t('diary.progression.select.all', { defaultValue: 'Tout sélectionner' })} checked={sessionsShown.every((s) => checkedSessions.includes(s.id))} onChange={(e) => setCheckedSessions(e.target.checked ? sessionsShown.map((s) => s.id) : [])} />
                    </th>
                    <th>{t('diary.progression.label', { defaultValue: 'Titre' })}</th>
                    <th>{t('diary.progression.level', { defaultValue: 'Niveau' })}</th>
                    <th>{t('diary.subject', { defaultValue: 'Matière' })}</th>
                    <th>{t('diary.progression.homeworks', { defaultValue: 'Devoirs' })}</th>
                    {searching && <th>{t('diary.progression.folder', { defaultValue: 'Dossier' })}</th>}
                  </tr>
                </thead>
                <tbody>
                  {sessionsShown.map((s) => (
                    <tr key={s.id} draggable onDragStart={(e) => onDragStart(e, 'session', s.id)} data-session={s.id}>
                      <td><input type="checkbox" aria-label={`${t('diary.progression.select', { defaultValue: 'Sélectionner' })} ${s.title}`} checked={checkedSessions.includes(s.id)} onChange={(e) => setCheckedSessions(e.target.checked ? [...checkedSessions, s.id] : checkedSessions.filter((x) => x !== s.id))} /></td>
                      <td><Link to={`/progression/${s.id}`}>{s.title}</Link></td>
                      <td>{s.className || '—'}</td>
                      <td>{s.subjectLabel || '—'}</td>
                      <td data-homeworks-count>{s.homeworks.length}</td>
                      {searching && <td>{folderTitle(s.folderId)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {dialog?.kind === 'folder' && (
        <FolderDialog
          folder={dialog.folder}
          root={root}
          defaultParent={current.id}
          pending={saveFolder.isPending}
          onClose={() => setDialog(null)}
          onSave={(title, parentId) => saveFolder.mutate({ id: dialog.folder?.id ?? null, title, parentId })}
        />
      )}
      {dialog?.kind === 'delete' && (
        <Modal title={t('diary.progression.delete.title', { defaultValue: 'Supprimer la sélection' })} onClose={() => setDialog(null)}>
          {hasFolderSelected ? (
            <>
              <p>{t('diary.progression.delete.info', { defaultValue: 'Souhaitez-vous supprimer ce ou ces dossiers avec leur contenu, ou conserver les informations qu’ils contiennent ?' })}</p>
              <div className="d-flex gap-8 flex-wrap">
                <button type="button" className="btn btn-secondary" disabled={remove.isPending} onClick={() => remove.mutate(false)}>{t('diary.progression.delete.shallow', { defaultValue: 'Supprimer et conserver le contenu' })}</button>
                <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate(true)}>{t('diary.progression.delete.deep', { defaultValue: 'Supprimer les dossiers et leur contenu' })}</button>
              </div>
            </>
          ) : (
            <>
              <p>{t('diary.progression.delete.sessions', { defaultValue: 'Êtes-vous sûr de vouloir supprimer ces progressions ?' })}</p>
              <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate(false)}>{t('diary.progression.delete.confirm', { defaultValue: 'Supprimer les progressions' })}</button>
            </>
          )}
        </Modal>
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog root={root} pending={move.isPending} onClose={() => setDialog(null)} onMove={(target) => move.mutate({ sessions: checkedSessions, folders: [], target })} />
      )}
    </div>
  );
}

/** Création ou modification d'un dossier : nom et dossier parent (jamais lui-même ni un descendant). */
function FolderDialog({ folder, root, defaultParent, pending, onClose, onSave }: { folder: ProgressionFolder | null; root: ProgressionFolder; defaultParent: number | null; pending: boolean; onClose: () => void; onSave: (title: string, parentId: number | null) => void }) {
  const { t } = useTranslation(['diary', 'common']);
  const [title, setTitle] = useState(folder?.title ?? '');
  const [parentId, setParentId] = useState<number | null>(folder ? folder.parentId : defaultParent);
  const choices = parentChoices(root, folder);
  const submit = (e: FormEvent) => { e.preventDefault(); if (title.trim()) onSave(title.trim(), parentId); };
  return (
    <Modal title={t('diary.progression.folder.title', { defaultValue: 'Dossier de progressions' })} onClose={onClose}>
      <form onSubmit={submit} className="d-flex flex-column gap-12">
        <div>
          <label htmlFor="pf-title" className="form-label">{t('diary.progression.folder.name', { defaultValue: 'Nom du dossier' })}</label>
          <input id="pf-title" className="form-control" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pf-parent" className="form-label">{t('diary.progression.folder.parent', { defaultValue: 'Dossier parent' })}</label>
          <select id="pf-parent" className="form-select" value={parentId === null ? '' : String(parentId)} onChange={(e) => setParentId(e.target.value === '' ? null : Number(e.target.value))}>
            {choices.map((f) => <option key={f.id ?? 'root'} value={f.id === null ? '' : String(f.id)}>{`${'– '.repeat(f.deepStep)}${f.title}`}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary align-self-end" disabled={pending || !title.trim()}>
          {folder ? t('diary.progression.folder.update', { defaultValue: 'Modifier le dossier' }) : t('diary.progression.folder.validate', { defaultValue: 'Créer le dossier' })}
        </button>
      </form>
    </Modal>
  );
}

/** Déplacement des progressions cochées vers un dossier. */
function MoveDialog({ root, pending, onClose, onMove }: { root: ProgressionFolder; pending: boolean; onClose: () => void; onMove: (target: number | null) => void }) {
  const { t } = useTranslation(['diary', 'common']);
  const [target, setTarget] = useState<number | null>(null);
  return (
    <Modal title={t('diary.progression.move.title', { defaultValue: 'Déplacer la sélection' })} onClose={onClose}>
      <label htmlFor="pm-target" className="form-label">{t('diary.progression.move.into', { defaultValue: 'Dans le dossier' })}</label>
      <select id="pm-target" className="form-select mb-12" value={target === null ? '' : String(target)} onChange={(e) => setTarget(e.target.value === '' ? null : Number(e.target.value))}>
        {flatten(root).map((f) => <option key={f.id ?? 'root'} value={f.id === null ? '' : String(f.id)}>{`${'– '.repeat(f.deepStep)}${f.title}`}</option>)}
      </select>
      <div className="d-flex justify-content-end gap-8">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('diary.cancel', { defaultValue: 'Annuler' })}</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => onMove(target)}>{t('diary.progression.move', { defaultValue: 'Déplacer' })}</button>
      </div>
    </Modal>
  );
}

export default Progressions;
