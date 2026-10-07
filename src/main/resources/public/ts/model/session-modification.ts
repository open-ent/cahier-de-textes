import http from 'axios';
import {ToastUtils, DateUtils} from './index';
import {Session} from './session';

export enum SessionModificationStatus {
    PENDING = 1,
    ACCEPTED = 2,
    REFUSED = 3
}

export interface ISessionModification {
    id?: number;
    session_id?: number;
    course_id?: string;
    date?: string;
    structure_id?: string;
    teacher_id?: string;
    proposed_by?: string;
    status?: number;
    payload?: any;
    refusal_reason?: string;
    created?: string;
    modified?: string;
}

// Une proposition de création/modification de séance par un tiers (ADML) à l'attention de
// l'enseignant propriétaire, qui doit l'accepter ou la refuser. Voir diary.session_modification.
export class SessionModification implements ISessionModification {
    id: number;
    session_id: number;
    course_id: string;
    date: string;
    structure_id: string;
    teacher_id: string;
    proposed_by: string;
    status: number;
    payload: any;
    refusal_reason: string;
    created: string;
    modified: string;

    static async propose(session: Session, teacherId: string): Promise<any> {
        const body = {
            sessionId: session.id || null,
            courseId: session.courseId || null,
            date: session.date ? DateUtils.getFormattedDate(session.date) : null,
            structureId: session.structure.id,
            teacherId: teacherId,
            payload: session.toSendFormat()
        };
        let response = await http.post('/diary/session/modification', body);
        return ToastUtils.setToastMessage(response, 'diary.session.modification.propose.success', 'session.updated.error');
    }

    static async listPendingForTeacher(): Promise<SessionModification[]> {
        let {data} = await http.get('/diary/session/modification/pending');
        return data;
    }

    static async listForSession(sessionId: number): Promise<SessionModification[]> {
        let {data} = await http.get(`/diary/session/${sessionId}/modifications`);
        return data;
    }

    async accept(): Promise<any> {
        let response = await http.put(`/diary/session/modification/${this.id}/process`,
            {status: SessionModificationStatus.ACCEPTED});
        return ToastUtils.setToastMessage(response, 'diary.session.modification.accepted.success', 'session.updated.error');
    }

    async refuse(reason?: string): Promise<any> {
        let response = await http.put(`/diary/session/modification/${this.id}/process`,
            {status: SessionModificationStatus.REFUSED, refusalReason: reason || null});
        return ToastUtils.setToastMessage(response, 'diary.session.modification.refused.success', 'session.updated.error');
    }
}
