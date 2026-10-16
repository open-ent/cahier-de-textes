import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { formatDate } from '../utils';

/**
 * Propositions de modification en attente sur une séance, vues par son propriétaire, comme
 * l'AngularJS (session-page.html) : accepter applique le contenu proposé à la séance, refuser la
 * laisse inchangée (motif facultatif transmis à l'auteur). Ex. un collègue propose de corriger le
 * titre → bandeau « Une modification de cette séance vous a été proposée ».
 */
export function PendingModifications({ sessionId, onDone }: { sessionId: number; onDone: (accepted: boolean, text: string) => void | Promise<void> }) {
  const { t } = useTranslation(['diary', 'common']);
  const qc = useQueryClient();
  const [refusing, setRefusing] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const query = useQuery({ queryKey: ['diary', 'session-modifications', sessionId], queryFn: () => api.getSessionModifications(sessionId), staleTime: 0 });
  const pending = (query.data ?? []).filter((m) => m.status === 1);

  const process = useMutation({
    mutationFn: (v: { id: number; accept: boolean; reason?: string }) => api.processSessionModification(v.id, v.accept, v.reason),
    onSuccess: async (_r, v) => {
      setRefusing(null);
      setReason('');
      setNotice(null);
      void qc.invalidateQueries({ queryKey: ['diary', 'session-modifications', sessionId] });
      // Le message est affiché par le formulaire : il se recharge après une acceptation et ce bloc disparaît.
      await onDone(
        v.accept,
        v.accept
          ? t('diary.session.modification.accepted.success', { defaultValue: 'Proposition acceptée, la séance a été mise à jour.' })
          : t('diary.session.modification.refused.success', { defaultValue: "Proposition refusée, la séance n'a pas été modifiée." }),
      );
    },
    onError: () => setNotice({ ok: false, text: t('diary.session.error', { defaultValue: "L'enregistrement de la séance a échoué." }) }),
  });

  if (pending.length === 0 && !notice) return null;
  return (
    <div data-modifications>
      {notice && <div className={`alert ${notice.ok ? 'alert-success' : 'alert-warning'}`} role={notice.ok ? 'status' : 'alert'} data-modification-notice>{notice.text}</div>}
      {pending.map((m) => (
        <div key={m.id} className="card p-16 mb-16" data-modification={m.id}>
          <p>
            {t('diary.session.modification.pending.banner', { defaultValue: 'Une modification de cette séance vous a été proposée.' })}
            {m.created && <span className="text-muted"> ({formatDate(m.created)})</span>}
          </p>
          <div className="d-flex gap-8 flex-wrap">
            <button type="button" className="btn btn-primary" disabled={process.isPending} onClick={() => process.mutate({ id: m.id, accept: true })}>
              {t('diary.session.modification.accept', { defaultValue: 'Accepter' })}
            </button>
            <button type="button" className="btn btn-secondary" disabled={process.isPending} onClick={() => setRefusing(refusing === m.id ? null : m.id)}>
              {t('diary.session.modification.refuse', { defaultValue: 'Refuser' })}
            </button>
          </div>
          {refusing === m.id && (
            <div className="mt-12">
              <label htmlFor={`pm-reason-${m.id}`} className="form-label">{t('diary.session.modification.refuse.reason.label', { defaultValue: 'Motif du refus (facultatif)' })}</label>
              <textarea id={`pm-reason-${m.id}`} className="form-control mb-8" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="btn btn-danger" disabled={process.isPending} onClick={() => process.mutate({ id: m.id, accept: false, reason })}>
                {t('diary.session.modification.refuse.confirm.title', { defaultValue: 'Refuser la proposition' })}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default PendingModifications;
