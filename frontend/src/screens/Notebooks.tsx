import { Alert, Badge, Button, Checkbox, Heading, Loading, Pagination, Table } from '@open-ent/react';
import { IconPrint, IconRafterDown, IconRafterUp } from '@open-ent/react/icons';
import { Editor } from '@open-ent/react/editor';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { Chips, Suggestions } from '../components/Chips';
import { Empty } from '../components/Empty';
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
    return <Alert type="info">{t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</Alert>;
  }
  const visaState = triState(filters.vised, filters.notVised);
  // Un filtre qui s'active ou non est une case à cocher : les boutons d'avant dessinaient leur
  // propre coche et empruntaient la couleur d'une action principale pour dire « retenu ».
  const toggleBtn = (on: boolean, label: string, onClick: () => void, attr: string) => (
    <span data-filter={attr}>
      <Checkbox label={label} checked={on} onChange={onClick} />
    </span>
  );

  return (
    <div>
      {notice && (
        <div className="mb-16" data-notice>
          <Alert type={notice.ok ? 'success' : 'danger'} isDismissible onClose={() => setNotice(null)}>
            {notice.text}
          </Alert>
        </div>
      )}

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
          <div className="d-flex gap-16 flex-wrap align-items-center pb-8">
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
              <Button type="button" color="tertiary" variant="outline" isLoading={selectAll.isPending} onClick={() => selectAll.mutate()}>{t('diary.visa.mass.select', { defaultValue: 'Sélectionner tout le résultat du filtre' })}</Button>
            ) : (
              <>
                <span className="text-gray-700" data-mass-count>{selectedRows.length} / {mass.total} {t('diary.visa.mass.selected.count', { defaultValue: 'sélectionné(s) sur toute la période filtrée' })}</span>
                <Button type="button" color="primary" variant="filled" disabled={selectedRows.length === 0} onClick={() => setVisaFor(selectedRows)}>{t('diary.visa.mass.viser', { defaultValue: 'Viser la sélection' })}</Button>
                <Button type="button" color="tertiary" variant="ghost" onClick={() => { setMass(null); setSelected(new Set()); }}>{t('diary.cancel', { defaultValue: 'Annuler' })}</Button>
              </>
            )}
          </div>
        )}
      </section>

      {selectedRows.length > 0 && !mass && (
        <div className="d-flex gap-8 flex-wrap align-items-center mb-16" role="toolbar" aria-label={t('diary.notebooks.actions', { defaultValue: 'Actions sur la sélection' })} data-toolbar>
          <span className="text-gray-700 me-8">
            {t('diary.notebooks.selected', { defaultValue: '[[count]] cahier(s) sélectionné(s)', count: selectedRows.length })}
          </span>
          {canVisa && <Button type="button" color="primary" variant="filled" onClick={() => setVisaFor(selectedRows)}>{t('visa.manage.viser', { defaultValue: 'Viser' })}</Button>}
          <Button type="button" color="tertiary" variant="outline" leftIcon={<IconPrint />} isLoading={printPdf.isPending} onClick={() => printPdf.mutate(selectedRows)}>{t('visa.manage.diaryToPrintPDF', { defaultValue: 'Imprimer en PDF' })}</Button>
          {canReadVisa && selectedRows.length === 1 && parseVisas(selectedRows[0].visas_detail).length > 0 && (
            <Button type="button" color="tertiary" variant="ghost" onClick={() => showVisas.mutate(selectedRows[0])}>{t('sessions.admin.icon.dwlPdf', { defaultValue: 'Visa(s) créé(s)' })}</Button>
          )}
        </div>
      )}

      {query.isLoading && <Loading isLoading />}
      {query.isError && (
        <div className="mb-16">
          <Alert type="warning">{t('diary.notebooks.error', { defaultValue: 'Les cahiers de textes n’ont pas pu être chargés.' })}</Alert>
        </div>
      )}
      {!query.isLoading && !query.isError && rows.length === 0 && (
        <Empty
          illustration="search"
          title={t('diary.notAvailable', { defaultValue: "Il n'y a pas de cahier de textes disponible pour le moment" })}
          text={t('diary.notebooks.empty.hint', { defaultValue: 'Élargissez la période ou retirez un filtre.' })}
        />
      )}
      {rows.length > 0 && (
        <div data-notebooks>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: '4rem' }}>
                  <Checkbox
                    aria-label={t('diary.progression.select.all', { defaultValue: 'Tout sélectionner' })}
                    checked={allChecked}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map(notebookKey)) : new Set())}
                  />
                </Table.Th>
                <Table.Th>{t('utils.group', { defaultValue: 'Classe' })}</Table.Th>
                <Table.Th>{t('subjects', { defaultValue: 'Matières' })}</Table.Th>
                {!teacherProfile && <Table.Th>{t('utils.teacher', { defaultValue: 'Enseignant' })}</Table.Th>}
                <Table.Th>{t('sessions.admin.lastUpdateSession', { defaultValue: 'Modifié le' })}</Table.Th>
                <Table.Th>{t('sessions.admin.numberSessions', { defaultValue: 'Nombre de séances' })}</Table.Th>
                <Table.Th>
                  {visaState === false ? (
                    t('sessions.admin.state', { defaultValue: 'État' })
                  ) : (
                    <Button
                      type="button"
                      color="tertiary"
                      variant="ghost"
                      size="sm"
                      className="px-0"
                      rightIcon={filters.orderVisaAsc ? <IconRafterUp /> : <IconRafterDown />}
                      onClick={() => changeFilters({ orderVisaAsc: !filters.orderVisaAsc })}
                      data-sort-visa
                    >
                      {t('sessions.admin.state', { defaultValue: 'État' })}
                    </Button>
                  )}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
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
                      <Badge variant={{ type: 'content', level: 'warning', background: true }}>
                        {t('sessions.admin.Visa.sateKo', { defaultValue: 'Non Visés' })}
                      </Badge>
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
          </Table>
        </div>
      )}
      {pageCount > 1 && (
        <nav className="d-flex justify-content-center mt-16" aria-label={t('diary.notebooks.pagination', { defaultValue: 'Pagination' })} data-pagination>
          <Pagination current={page + 1} total={pageCount} pageSize={1} onChange={(next) => setPage(next - 1)} />
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
            <Button type="button" color="tertiary" variant="ghost" onClick={() => setVisaFor(null)}>{t('diary.cancel', { defaultValue: 'Annuler' })}</Button>
            <Button type="button" color="primary" variant="filled" isLoading={createVisa.isPending} onClick={() => createVisa.mutate(visaFor)}>{t('visa.vise.diary', { defaultValue: 'Viser les cahiers de textes' })}</Button>
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
    <Table.Tbody data-notebook={notebookKey(n)}>
      <Table.Tr>
        <Table.Td>
          <Checkbox
            aria-label={`${t('diary.progression.select', { defaultValue: 'Sélectionner' })} ${n.audience.name} ${subjectLabelOf(n)}`}
            checked={checked}
            onChange={(e) => onCheck(e.target.checked)}
          />
        </Table.Td>
        <Table.Td>{n.audience.name}</Table.Td>
        <Table.Td>
          <Button type="button" color="tertiary" variant="ghost" size="sm" className="px-0 text-start" aria-expanded={opened} onClick={onToggleOpen}>
            {subjectLabelOf(n) || '—'}
          </Button>
        </Table.Td>
        {showTeacher && <Table.Td>{n.teacher.lastName} {n.teacher.firstName}</Table.Td>}
        <Table.Td className="text-nowrap">{formatDate(n.modified)}</Table.Td>
        <Table.Td data-count>{n.sessions}</Table.Td>
        <Table.Td>{visaCell}</Table.Td>
      </Table.Tr>
      {opened && (
        <Table.Tr>
          {/* `Table.Td` du socle ne déclare pas `colSpan` : cellule native pour celle-ci, le
              composant ne posant de toute façon aucune classe. */}
          <td colSpan={colSpan} data-contents>
            {contents.isLoading && <Loading isLoading />}
            <ul className="list-unstyled m-0">
              {(contents.data ?? []).map((c, i) => (
                <li key={`${c.type}-${c.id}`} className="d-flex gap-12 flex-wrap align-items-center py-4" data-content={`${c.type}-${c.id}`}>
                  <Button type="button" color="tertiary" variant="ghost" size="sm" className="px-0 text-start" style={{ minWidth: '22rem' }} onClick={() => onRead(contents.data ?? [], i)}>
                    {contentTitle(c, forDate)}
                  </Button>
                  <span className="small text-gray-700">{contentWhen(c, labels)}</span>
                  <span className="small text-gray-700">{c.diaryType?.label ?? ''}</span>
                  <Badge variant={{ type: 'content', level: c.is_published ? 'success' : 'warning', background: true }}>
                    {c.is_published ? t('published', { defaultValue: 'Publié' }) : t('notpublished.s', { defaultValue: 'Non publié' })}
                  </Badge>
                </li>
              ))}
            </ul>
          </td>
        </Table.Tr>
      )}
    </Table.Tbody>
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
        <span className="text-gray-700">{c.diaryType?.label ?? ''}</span>
        <Badge variant={{ type: 'content', level: c.is_published ? 'success' : 'warning', background: true }}>
          {c.is_published ? t('published', { defaultValue: 'Publié' }) : t('notpublished.s', { defaultValue: 'Non publié' })}
        </Badge>
      </div>
      {c.type === 'SESSION' && c.title && <Heading level="h3" headingStyle="h4" className="mb-8">{c.title}</Heading>}
      {/* Lecture seule dans l'éditeur du socle : le contenu d'un tiers est assaini, jamais injecté tel quel. */}
      <div className="mb-12" data-reader-description>
        <Editor key={`${c.type}-${c.id}`} content={c.description && c.description.trim() ? c.description : '<p></p>'} mode="read" focus={false} variant="ghost" visibility="protected" />
      </div>
      <div className="d-flex gap-8 flex-wrap justify-content-between">
        <div className="d-flex gap-8">
          <Button type="button" color="tertiary" variant="outline" disabled={index === 0} onClick={() => onIndex(index - 1)}>{t('diary.notebooks.previous', { defaultValue: 'Précédent' })}</Button>
          <Button type="button" color="tertiary" variant="outline" disabled={index >= contents.length - 1} onClick={() => onIndex(index + 1)}>{t('diary.notebooks.next', { defaultValue: 'Suivant' })}</Button>
        </div>
        <div className="d-flex gap-8">
          {canModify && <Link className="btn btn-outline-tertiary btn-md" to={`${c.type === 'HOMEWORK' ? '/devoir' : '/seance'}/${c.id}`}>{t('utils.modify', { defaultValue: 'Modifier' })}</Link>}
          {canVisa && <Button type="button" color="primary" variant="filled" onClick={onVisa}>{t('visa.manage.viser', { defaultValue: 'Viser' })}</Button>}
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

  return (
    <div className="d-flex gap-16 flex-wrap" role="search" data-search>
      <div className="diary-search-field">
        <label htmlFor="nb-teacher" className="form-label">{t('diary.search.teacher', { defaultValue: 'Enseignant' })}</label>
        <input id="nb-teacher" className="form-control" autoComplete="off" value={tq} onChange={(e) => setTq(e.target.value)} placeholder={t('diary.search.teacher.placeholder', { defaultValue: 'Rechercher un enseignant…' })} />
        {tq.trim().length >= 2 && (
          <Suggestions
            attrs={{ 'data-suggestions-teachers': true }}
            items={(ts.data ?? []).filter((x) => !tIds.has(x.id)).map((x) => ({ id: x.id, label: x.displayName }))}
            onPick={(id) => { const f = (ts.data ?? []).find((x) => x.id === id); if (f) onTeachers([...teachers, f]); setTq(''); }}
          />
        )}
        <Chips
          attrs={{ 'data-chosen-teachers': true }}
          items={teachers.map((x) => ({ id: x.id, label: x.displayName }))}
          onRemove={(id) => onTeachers(teachers.filter((x) => x.id !== id))}
        />
      </div>
      <div className="diary-search-field">
        <label htmlFor="nb-class" className="form-label">{t('diary.search.class', { defaultValue: 'Classe ou groupe' })}</label>
        <input id="nb-class" className="form-control" autoComplete="off" value={cq} onChange={(e) => setCq(e.target.value)} placeholder={t('diary.search.class.placeholder', { defaultValue: 'Rechercher une classe…' })} />
        {cq.trim().length >= 2 && (
          <Suggestions
            attrs={{ 'data-suggestions-classes': true }}
            items={(cs.data ?? []).filter((x) => !cIds.has(x.id)).map((x) => ({ id: x.id, label: x.name }))}
            onPick={(id) => { const f = (cs.data ?? []).find((x) => x.id === id); if (f) onClasses([...classes, f]); setCq(''); }}
          />
        )}
        <Chips
          attrs={{ 'data-chosen-classes': true }}
          items={classes.map((x) => ({ id: x.id, label: x.name }))}
          onRemove={(id) => onClasses(classes.filter((x) => x.id !== id))}
        />
      </div>
    </div>
  );
}

export default Notebooks;
