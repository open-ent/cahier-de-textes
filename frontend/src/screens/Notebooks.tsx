import { Editor } from '@open-ent/react/editor';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { useDiaryContext } from '../hooks/useDiaryContext';
import {
  contentQuery,
  contentTitle,
  contentWhen,
  distinctVisas,
  Notebook,
  NotebookContent,
  NotebookFilters,
  notebookKey,
  notebooksQuery,
  parseVisas,
  subjectLabelOf,
  toggleExclusive,
  triState,
  visaLabel,
  visaPayload,
} from '../notebooks';
import type { SearchClass, SearchTeacher } from '../searchScope';
import { formatDate, ymd } from '../utils';
import { Modal } from './Modal';

/** Ouvre le fichier reçu dans le navigateur (téléchargement). */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Cahiers de textes (séances et devoirs par enseignant, classe et matière), comme l'AngularJS
 * (administrator/admin-main-page.html) : filtres (période, visés, publiés, enseignants, classes),
 * liste paginée avec l'état des visas, contenu dépliable et consultable, visa avec commentaire,
 * impression PDF, visas déjà créés et visa en masse (droit distinct). Ex. cahier « Maths · 401 ·
 * DUPONT Anne » : 5 séances, visé le 18/09/2026 par la direction.
 */
export function Notebooks() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const qc = useQueryClient();
  const structureId = ctx.structure?.id ?? '';
  const teacherProfile = ctx.profile === 'teacher';
  const canVisa = ctx.has('manageVisa');
  const canReadVisa = ctx.has('readVisa');
  const canMass = ctx.has('adminVisaMassManage');

  const year = useQuery({ queryKey: ['diary', 'school-year', structureId], queryFn: () => api.getSchoolYear(structureId), enabled: !!structureId });
  const [filters, setFilters] = useState<Omit<NotebookFilters, 'structureId' | 'page'>>({
    start: '', end: ymd(new Date()), vised: true, notVised: true, published: true, notPublished: true, orderVisaAsc: false, teacherIds: [], audienceIds: [],
  });
  const [teachers, setTeachers] = useState<SearchTeacher[]>([]);
  const [classes, setClasses] = useState<SearchClass[]>([]);
  const [page, setPage] = useState(0);
  // Début de période : début de l'année scolaire (comme l'AngularJS), à défaut un an en arrière.
  useEffect(() => {
    if (filters.start || year.isLoading) return;
    const fallback = new Date();
    fallback.setFullYear(fallback.getFullYear() - 1);
    setFilters((f) => ({ ...f, start: year.data?.start ?? ymd(fallback) }));
  }, [filters.start, year.isLoading, year.data]);

  // Un enseignant ne voit que ses cahiers tant qu'il n'a pas choisi d'enseignants.
  const effective: NotebookFilters = {
    ...filters,
    structureId,
    teacherIds: teacherProfile && teachers.length === 0 ? [ctx.userId] : teachers.map((x) => x.id),
    audienceIds: classes.map((c) => c.id),
  };
  const [mass, setMass] = useState<MassList | null>(null);
  const query = useQuery({
    queryKey: ['diary', 'notebooks', notebooksQuery({ ...effective, page })],
    queryFn: () => api.getNotebooks(notebooksQuery({ ...effective, page })),
    enabled: !!structureId && !!filters.start && (!teacherProfile || !!ctx.userId),
  });
  const rows: Notebook[] = mass ? mass.all : (query.data?.all ?? []);
  const pageCount = mass ? 0 : (query.data?.page_count ?? 0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [reader, setReader] = useState<{ notebook: Notebook; contents: NotebookContent[]; index: number } | null>(null);
  const [visaFor, setVisaFor] = useState<Notebook[] | null>(null);
  const [visasList, setVisasList] = useState<Array<{ id: number; label: string }> | null>(null);
  const [comment, setComment] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const changeFilters = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
    setSelected(new Set());
    setMass(null);
  };
  const loadContents = (n: Notebook) => qc.fetchQuery({ queryKey: ['diary', 'notebook-contents', contentQuery(n, effective)], queryFn: () => api.getNotebookContents(contentQuery(n, effective)), staleTime: 0 });
  const selectedRows = rows.filter((n) => selected.has(notebookKey(n)));

  const labels = {
    forDate: t('homework.for.date', { defaultValue: 'Pour le' }),
    from: t('from2', { defaultValue: 'de' }),
    to: t('to2', { defaultValue: 'à' }),
  };
  const context = (): Parameters<typeof visaPayload>[1] => ({
    comment: comment.trim(),
    user: ctx.userName,
    structureId,
    structureName: ctx.structure?.name ?? '',
    atWord: t('at', { defaultValue: 'à' }),
    noWorkload: t('homework.no.workload', { defaultValue: 'Aucune durée estimée' }),
    now: new Date(),
  });

  const createVisa = useMutation({
    mutationFn: async (books: Notebook[]) => {
      const visas = [];
      for (const n of books) {
        const contents = await loadContents(n);
        if (contents.length) visas.push(visaPayload(contents, context()));
      }
      await api.createVisas(mass !== null, structureId, visas);
    },
    onSuccess: () => {
      setVisaFor(null);
      setReader(null);
      setComment('');
      setSelected(new Set());
      setMass(null);
      setNotice({ ok: true, text: t('visa.manage.create.success', { defaultValue: 'Visa(s) créé(s)' }) });
      void qc.invalidateQueries({ queryKey: ['diary', 'notebooks'] });
    },
    onError: () => setNotice({ ok: false, text: t('visa.manage.create.error', { defaultValue: 'Erreur lors de la créations de visa(s)' }) }),
  });
  const printPdf = useMutation({
    mutationFn: async (books: Notebook[]) => {
      for (const n of books) {
        const contents = await loadContents(n);
        if (!contents.length) continue;
        const { blob, filename } = await api.visaToPdf(visaPayload(contents, context()));
        download(blob, filename);
      }
    },
    onSuccess: () => setSelected(new Set()),
    onError: () => setNotice({ ok: false, text: t('diary.notebooks.pdf.error', { defaultValue: "Le PDF n'a pas pu être créé." }) }),
  });
  const showVisas = useMutation({
    mutationFn: async (n: Notebook) => {
      const contents = await loadContents(n);
      return distinctVisas(contents).map((v) => ({ id: v.id, label: `${formatDate(v.created)} - ${n.audience.name} - ${v.owner || n.teacher.displayName}` }));
    },
    onSuccess: (list) => setVisasList(list),
  });
  const selectAll = useMutation({
    mutationFn: async () => {
      const full = await api.getNotebooks(notebooksQuery(effective));
      return full;
    },
    onSuccess: (full) => {
      setMass({ all: full.all, total: full.all.length });
      setSelected(new Set(full.all.map(notebookKey)));
    },
  });

  const toggleOpen = (n: Notebook) => setOpen((s) => { const c = new Set(s); const k = notebookKey(n); if (c.has(k)) c.delete(k); else c.add(k); return c; });
  const toggleSel = (n: Notebook, on: boolean) => setSelected((s) => { const c = new Set(s); if (on) c.add(notebookKey(n)); else c.delete(notebookKey(n)); return c; });
  const allChecked = rows.length > 0 && rows.every((n) => selected.has(notebookKey(n)));

  if (ctx.ready && !structureId) {
    return <div className="alert alert-info" role="alert">{t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</div>;
  }
  const visaState = triState(filters.vised, filters.notVised);
  const toggleBtn = (on: boolean, label: string, onClick: () => void, attr: string) => (
    <button type="button" className={`btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={on} onClick={onClick} data-filter={attr}>{on ? '✓ ' : ''}{label}</button>
  );

  return (
    <div>
      <h1 className="mb-16">{t('sessions.admin.main.title', { defaultValue: 'Cahiers de textes' })}</h1>
      {notice && <div className={`alert alert-${notice.ok ? 'success' : 'danger'}`} role={notice.ok ? 'status' : 'alert'} data-notice>{notice.text}</div>}

      <section className="mb-16" aria-label={t('diary.notebooks.filters', { defaultValue: 'Filtres' })}>
        <div className="d-flex gap-16 flex-wrap align-items-end mb-12">
          <div>
            <label htmlFor="nb-start" className="form-label">{t('from', { defaultValue: 'Du' })}</label>
            <input id="nb-start" type="date" className="form-control" value={filters.start} max={filters.end} onChange={(e) => e.target.value && changeFilters({ start: e.target.value })} />
          </div>
          <div>
            <label htmlFor="nb-end" className="form-label">{t('to', { defaultValue: 'Au' })}</label>
            <input id="nb-end" type="date" className="form-control" value={filters.end} min={filters.start} onChange={(e) => e.target.value && changeFilters({ end: e.target.value })} />
          </div>
          <div className="d-flex gap-8 flex-wrap">
            {toggleBtn(filters.vised, t('sessions.admin.Visa.sateOk', { defaultValue: 'Visés' }), () => { const r = toggleExclusive(filters.vised, filters.notVised, 'yes'); changeFilters({ vised: r.yes, notVised: r.no }); }, 'vised')}
            {toggleBtn(filters.notVised, t('sessions.admin.Visa.sateKo', { defaultValue: 'Non Visés' }), () => { const r = toggleExclusive(filters.vised, filters.notVised, 'no'); changeFilters({ vised: r.yes, notVised: r.no }); }, 'not-vised')}
            {toggleBtn(filters.published, t('published.p', { defaultValue: 'Publiés' }), () => { const r = toggleExclusive(filters.published, filters.notPublished, 'yes'); changeFilters({ published: r.yes, notPublished: r.no }); }, 'published')}
            {toggleBtn(filters.notPublished, t('notpublished.p', { defaultValue: 'Non publiés' }), () => { const r = toggleExclusive(filters.published, filters.notPublished, 'no'); changeFilters({ published: r.yes, notPublished: r.no }); }, 'not-published')}
          </div>
        </div>
        {!teacherProfile && ctx.has('diarySearch') && (
          <FilterSearch
            structureId={structureId}
            teachers={teachers}
            classes={classes}
            onTeachers={(v) => { setTeachers(v); setPage(0); setSelected(new Set()); setMass(null); }}
            onClasses={(v) => { setClasses(v); setPage(0); setSelected(new Set()); setMass(null); }}
          />
        )}
        {canMass && (
          <div className="d-flex gap-8 align-items-center flex-wrap mt-8" data-mass>
            {!mass ? (
              <button type="button" className="btn btn-secondary" disabled={selectAll.isPending} onClick={() => selectAll.mutate()}>{t('diary.visa.mass.select', { defaultValue: 'Sélectionner tout le résultat du filtre' })}</button>
            ) : (
              <>
                <span className="card p-8" data-mass-count>{selectedRows.length} / {mass.total} {t('diary.visa.mass.selected.count', { defaultValue: 'sélectionné(s) sur toute la période filtrée' })}</span>
                <button type="button" className="btn btn-primary" disabled={selectedRows.length === 0} onClick={() => setVisaFor(selectedRows)}>{t('diary.visa.mass.viser', { defaultValue: 'Viser la sélection' })}</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setMass(null); setSelected(new Set()); }}>{t('diary.cancel', { defaultValue: 'Annuler' })}</button>
              </>
            )}
          </div>
        )}
      </section>

      {selectedRows.length > 0 && !mass && (
        <div className="d-flex gap-8 flex-wrap mb-12" role="toolbar" aria-label={t('diary.notebooks.actions', { defaultValue: 'Actions sur la sélection' })} data-toolbar>
          {canVisa && <button type="button" className="btn btn-primary" onClick={() => setVisaFor(selectedRows)}>{t('visa.manage.viser', { defaultValue: 'Viser' })}</button>}
          <button type="button" className="btn btn-secondary" disabled={printPdf.isPending} onClick={() => printPdf.mutate(selectedRows)}>{t('visa.manage.diaryToPrintPDF', { defaultValue: 'Imprimer en PDF' })}</button>
          {canReadVisa && selectedRows.length === 1 && parseVisas(selectedRows[0].visas_detail).length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => showVisas.mutate(selectedRows[0])}>{t('sessions.admin.icon.dwlPdf', { defaultValue: 'Visa(s) créé(s)' })}</button>
          )}
        </div>
      )}

      {query.isLoading && <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>}
      {query.isError && <div className="alert alert-warning" role="alert">{t('diary.notebooks.error', { defaultValue: 'Les cahiers de textes n’ont pas pu être chargés.' })}</div>}
      {!query.isLoading && !query.isError && rows.length === 0 && <p className="text-muted" data-empty>{t('diary.notAvailable', { defaultValue: "Il n'y a pas de cahier de textes disponible pour le moment" })}</p>}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table table-bordered mb-0" data-notebooks>
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" aria-label={t('diary.progression.select.all', { defaultValue: 'Tout sélectionner' })} checked={allChecked} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map(notebookKey)) : new Set())} /></th>
                <th>{t('utils.group', { defaultValue: 'Classe' })}</th>
                <th>{t('subjects', { defaultValue: 'Matières' })}</th>
                {!teacherProfile && <th>{t('utils.teacher', { defaultValue: 'Enseignant' })}</th>}
                <th>{t('sessions.admin.lastUpdateSession', { defaultValue: 'Modifié le' })}</th>
                <th>{t('sessions.admin.numberSessions', { defaultValue: 'Nombre de séances' })}</th>
                <th>
                  {visaState === false ? (
                    t('sessions.admin.state', { defaultValue: 'État' })
                  ) : (
                    <button type="button" className="btn btn-link p-0" onClick={() => changeFilters({ orderVisaAsc: !filters.orderVisaAsc })} data-sort-visa>
                      {t('sessions.admin.state', { defaultValue: 'État' })} {filters.orderVisaAsc ? '▲' : '▼'}
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            {rows.map((n) => {
              const key = notebookKey(n);
              const visas = parseVisas(n.visas_detail);
              return (
                <NotebookBody
                  key={key}
                  notebook={n}
                  checked={selected.has(key)}
                  opened={open.has(key)}
                  showTeacher={!teacherProfile}
                  loadKey={contentQuery(n, effective)}
                  onToggleOpen={() => toggleOpen(n)}
                  onCheck={(on) => toggleSel(n, on)}
                  visaCell={
                    visas.length === 0 ? (
                      <span>{t('sessions.admin.Visa.sateKo', { defaultValue: 'Non Visés' })}</span>
                    ) : (
                      visas.map((v, i) => (
                        <div key={i} data-visa title={v.inspector ? t('diary.visa.inspector', { defaultValue: 'Inspecteur' }) : undefined}>
                          {visaLabel(v, t('sessions.admin.visa.sate.on', { defaultValue: 'Visé le ' }), t('diary.visa.by', { defaultValue: 'par' }))}
                        </div>
                      ))
                    )
                  }
                  labels={labels}
                  forDate={labels.forDate}
                  onRead={(contents, index) => setReader({ notebook: n, contents, index })}
                />
              );
            })}
          </table>
        </div>
      )}
      {pageCount > 1 && (
        <nav className="d-flex gap-8 align-items-center mt-12" aria-label={t('diary.notebooks.pagination', { defaultValue: 'Pagination' })} data-pagination>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('diary.notebooks.previous', { defaultValue: 'Précédent' })}</button>
          <span>{page + 1} / {pageCount}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>{t('diary.notebooks.next', { defaultValue: 'Suivant' })}</button>
        </nav>
      )}

      {reader && (
        <Modal title={contentTitle(reader.contents[reader.index], labels.forDate) || t('diary.notebooks.content', { defaultValue: 'Contenu' })} onClose={() => setReader(null)}>
          <ReaderBody
            notebook={reader.notebook}
            contents={reader.contents}
            index={reader.index}
            labels={labels}
            canModify={ctx.has('manageSession') && reader.contents[reader.index].teacher.id === ctx.userId}
            canVisa={canVisa && reader.index === reader.contents.length - 1}
            onIndex={(i) => setReader({ ...reader, index: i })}
            onVisa={() => setVisaFor([reader.notebook])}
          />
        </Modal>
      )}
      {visaFor && (
        <Modal title={t('visa.vise.diary', { defaultValue: 'Viser les cahiers de textes' })} onClose={() => setVisaFor(null)}>
          <label htmlFor="nb-comment" className="form-label">{t('sessions.admin.comment', { defaultValue: 'Commentaire' })}</label>
          <textarea id="nb-comment" className="form-control mb-12" rows={4} placeholder={t('visa.create.commentLabel', { defaultValue: 'Ajouter le commentaire de visa(s)' })} value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="d-flex justify-content-end gap-8">
            <button type="button" className="btn btn-secondary" onClick={() => setVisaFor(null)}>{t('diary.cancel', { defaultValue: 'Annuler' })}</button>
            <button type="button" className="btn btn-primary" disabled={createVisa.isPending} onClick={() => createVisa.mutate(visaFor)}>{t('visa.vise.diary', { defaultValue: 'Viser les cahiers de textes' })}</button>
          </div>
        </Modal>
      )}
      {visasList && (
        <Modal title={t('visa.manage.title', { defaultValue: 'Visas du cahier de textes' })} onClose={() => setVisasList(null)}>
          <ul className="list-unstyled m-0" data-visas-list>
            {visasList.map((v) => (
              <li key={v.id} className="mb-8">
                <a href={`/diary/visa/${v.id}/pdf`}>{t('visa.manage.choosePdf', { defaultValue: 'Visa du' })} {v.label}</a>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

interface MassList {
  all: Notebook[];
  total: number;
}

interface BodyProps {
  notebook: Notebook;
  checked: boolean;
  opened: boolean;
  showTeacher: boolean;
  loadKey: string;
  visaCell: JSX.Element | JSX.Element[];
  labels: { forDate: string; from: string; to: string };
  forDate: string;
  onToggleOpen: () => void;
  onCheck: (on: boolean) => void;
  onRead: (contents: NotebookContent[], index: number) => void;
}

/** Une ligne de cahier et, dépliée, ses séances et devoirs. */
function NotebookBody({ notebook: n, checked, opened, showTeacher, loadKey, visaCell, labels, forDate, onToggleOpen, onCheck, onRead }: BodyProps) {
  const { t } = useTranslation(['diary', 'common']);
  const contents = useQuery({ queryKey: ['diary', 'notebook-contents', loadKey], queryFn: () => api.getNotebookContents(loadKey), enabled: opened, staleTime: 0 });
  const colSpan = showTeacher ? 7 : 6;
  return (
    <tbody data-notebook={notebookKey(n)}>
      <tr>
        <td><input type="checkbox" aria-label={`${t('diary.progression.select', { defaultValue: 'Sélectionner' })} ${n.audience.name} ${subjectLabelOf(n)}`} checked={checked} onChange={(e) => onCheck(e.target.checked)} /></td>
        <td>{n.audience.name}</td>
        <td><button type="button" className="btn btn-link p-0 text-start" aria-expanded={opened} onClick={onToggleOpen}>{subjectLabelOf(n) || '—'}</button></td>
        {showTeacher && <td>{n.teacher.lastName} {n.teacher.firstName}</td>}
        <td>{formatDate(n.modified)}</td>
        <td data-count>{n.sessions}</td>
        <td>{visaCell}</td>
      </tr>
      {opened && (
        <tr>
          <td colSpan={colSpan} data-contents>
            {contents.isLoading && <span>{t('diary.loading', { defaultValue: 'Chargement…' })}</span>}
            <ul className="list-unstyled m-0">
              {(contents.data ?? []).map((c, i) => (
                <li key={`${c.type}-${c.id}`} className="d-flex gap-12 flex-wrap align-items-center py-4" data-content={`${c.type}-${c.id}`}>
                  <span aria-hidden="true">{c.type === 'HOMEWORK' ? '📥' : '📖'}</span>
                  <button type="button" className="btn btn-link p-0 text-start" style={{ minWidth: 220 }} onClick={() => onRead(contents.data ?? [], i)}>{contentTitle(c, forDate)}</button>
                  <span>{contentWhen(c, labels)}</span>
                  <span>{c.diaryType?.label ?? ''}</span>
                  <span>{c.is_published ? t('published', { defaultValue: 'Publié' }) : t('notpublished.s', { defaultValue: 'Non publié' })}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </tbody>
  );
}

/** Contenu consulté : navigation précédent / suivant, modification (propriétaire), visa (dernier). */
function ReaderBody({ notebook, contents, index, labels, canModify, canVisa, onIndex, onVisa }: { notebook: Notebook; contents: NotebookContent[]; index: number; labels: { forDate: string; from: string; to: string }; canModify: boolean; canVisa: boolean; onIndex: (i: number) => void; onVisa: () => void }) {
  const { t } = useTranslation(['diary', 'common']);
  const c = contents[index];
  return (
    <div data-reader>
      <div className="d-flex gap-12 flex-wrap mb-12 align-items-center">
        <span>{contentWhen(c, labels)}</span>
        <span>{c.teacher.displayName}</span>
        <span>{c.diaryType?.label ?? ''}</span>
        <span>{c.is_published ? t('published', { defaultValue: 'Publié' }) : t('notpublished.s', { defaultValue: 'Non publié' })}</span>
      </div>
      {c.type === 'SESSION' && c.title && <h3 style={{ fontSize: 17 }}>{c.title}</h3>}
      {/* Lecture seule dans l'éditeur du socle : le contenu d'un tiers est assaini, jamais injecté tel quel. */}
      <div className="mb-12" data-reader-description>
        <Editor key={`${c.type}-${c.id}`} content={c.description && c.description.trim() ? c.description : '<p></p>'} mode="read" focus={false} variant="ghost" visibility="protected" />
      </div>
      <div className="d-flex gap-8 flex-wrap justify-content-between">
        <div className="d-flex gap-8">
          <button type="button" className="btn btn-secondary" disabled={index === 0} onClick={() => onIndex(index - 1)}>{t('diary.notebooks.previous', { defaultValue: 'Précédent' })}</button>
          <button type="button" className="btn btn-secondary" disabled={index >= contents.length - 1} onClick={() => onIndex(index + 1)}>{t('diary.notebooks.next', { defaultValue: 'Suivant' })}</button>
        </div>
        <div className="d-flex gap-8">
          {canModify && <Link className="btn btn-secondary" to={`${c.type === 'HOMEWORK' ? '/devoir' : '/seance'}/${c.id}`}>{t('utils.modify', { defaultValue: 'Modifier' })}</Link>}
          {canVisa && <button type="button" className="btn btn-primary" onClick={onVisa}>{t('visa.manage.viser', { defaultValue: 'Viser' })}</button>}
        </div>
      </div>
      <span className="visually-hidden">{notebook.audience.name}</span>
    </div>
  );
}

/** Recherche d'enseignants (plusieurs) et de classes (plusieurs) pour filtrer la liste. */
function FilterSearch({ structureId, teachers, classes, onTeachers, onClasses }: { structureId: string; teachers: SearchTeacher[]; classes: SearchClass[]; onTeachers: (v: SearchTeacher[]) => void; onClasses: (v: SearchClass[]) => void }) {
  const { t } = useTranslation(['diary', 'common']);
  const [tq, setTq] = useState('');
  const [cq, setCq] = useState('');
  const ts = useQuery({ queryKey: ['diary', 'nb-search', 'teachers', structureId, tq], queryFn: () => api.searchTeachers(structureId, tq), enabled: tq.trim().length >= 2 });
  const cs = useQuery({ queryKey: ['diary', 'nb-search', 'classes', structureId, cq], queryFn: () => api.searchClasses(structureId, cq), enabled: cq.trim().length >= 2 });
  const tIds = useMemo(() => new Set(teachers.map((x) => x.id)), [teachers]);
  const cIds = useMemo(() => new Set(classes.map((x) => x.id)), [classes]);
  const chips = (items: Array<{ id: string; label: string }>, remove: (id: string) => void, attr: string) =>
    items.length > 0 && (
      <ul className="list-inline mt-4 mb-0" {...{ [attr]: true }}>
        {items.map((x) => (
          <li key={x.id} className="d-inline-flex align-items-center gap-4 me-8 badge bg-secondary" style={{ color: '#fff' }}>
            {x.label}
            <button type="button" className="btn btn-link p-0 text-white" style={{ background: 'none', color: '#fff' }} aria-label={`${t('diary.search.remove', { defaultValue: 'Retirer' })} ${x.label}`} onClick={() => remove(x.id)}>×</button>
          </li>
        ))}
      </ul>
    );
  const list = (attr: string, items: Array<{ id: string; label: string }>, pick: (id: string) => void) =>
    items.length > 0 && (
      <ul className="list-unstyled border rounded bg-white p-4 m-0" style={{ position: 'absolute', zIndex: 20, minWidth: 240 }} {...{ [attr]: true }}>
        {items.map((x) => <li key={x.id}><button type="button" className="btn btn-link p-0 text-start" onClick={() => pick(x.id)}>{x.label}</button></li>)}
      </ul>
    );
  return (
    <div className="d-flex gap-16 flex-wrap" role="search" data-search>
      <div style={{ minWidth: 240, position: 'relative' }}>
        <label htmlFor="nb-teacher" className="form-label" style={{ fontWeight: 700 }}>{t('diary.search.teacher', { defaultValue: 'Enseignant' })}</label>
        <input id="nb-teacher" className="form-control" autoComplete="off" value={tq} onChange={(e) => setTq(e.target.value)} placeholder={t('diary.search.teacher.placeholder', { defaultValue: 'Rechercher un enseignant…' })} />
        {tq.trim().length >= 2 && list('data-suggestions-teachers', (ts.data ?? []).filter((x) => !tIds.has(x.id)).map((x) => ({ id: x.id, label: x.displayName })), (id) => { const f = (ts.data ?? []).find((x) => x.id === id); if (f) onTeachers([...teachers, f]); setTq(''); })}
        {chips(teachers.map((x) => ({ id: x.id, label: x.displayName })), (id) => onTeachers(teachers.filter((x) => x.id !== id)), 'data-chosen-teachers')}
      </div>
      <div style={{ minWidth: 240, position: 'relative' }}>
        <label htmlFor="nb-class" className="form-label" style={{ fontWeight: 700 }}>{t('diary.search.class', { defaultValue: 'Classe ou groupe' })}</label>
        <input id="nb-class" className="form-control" autoComplete="off" value={cq} onChange={(e) => setCq(e.target.value)} placeholder={t('diary.search.class.placeholder', { defaultValue: 'Rechercher une classe…' })} />
        {cq.trim().length >= 2 && list('data-suggestions-classes', (cs.data ?? []).filter((x) => !cIds.has(x.id)).map((x) => ({ id: x.id, label: x.name })), (id) => { const f = (cs.data ?? []).find((x) => x.id === id); if (f) onClasses([...classes, f]); setCq(''); })}
        {chips(classes.map((x) => ({ id: x.id, label: x.name })), (id) => onClasses(classes.filter((x) => x.id !== id)), 'data-chosen-classes')}
      </div>
    </div>
  );
}

export default Notebooks;
