import { Button, Modal } from '@open-ent/react';
import { ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';

export interface ConfirmModalProps {
  title: string;
  /** Ce que l'action va faire, en une phrase. */
  text: ReactNode;
  confirmLabel?: string;
  /** Teinte rouge et verbe de suppression : réservé à ce qui ne se récupère pas. */
  danger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation d'une action, à la place de `window.confirm` : la boîte native du navigateur
 * jure avec l'interface du socle et n'est pas traduite. Même composant que dans l'agenda.
 */
export function ConfirmModal({
  title,
  text,
  confirmLabel,
  danger = true,
  isLoading,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation(['diary', 'common']);

  return (
    <Modal id={useId()} isOpen onModalClose={onCancel} size="sm">
      <Modal.Header onModalClose={onCancel}>{title}</Modal.Header>
      <Modal.Body>
        <p className="m-0">{text}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onCancel}>
          {t('diary.cancel', { defaultValue: 'Annuler' })}
        </Button>
        <Button
          type="button"
          color={danger ? 'danger' : 'primary'}
          variant="filled"
          isLoading={isLoading}
          onClick={onConfirm}
        >
          {confirmLabel ?? t('diary.delete', { defaultValue: 'Supprimer' })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ConfirmModal;
