import { Modal as SocleModal } from '@open-ent/react';
import { ReactNode, useId } from 'react';

/**
 * Fenêtre modale du module, posée sur celle du socle : même habillage, même fermeture au clavier
 * et même piège de focus que partout ailleurs dans l'ENT. Auparavant le module peignait son
 * propre calque gris et sa propre croix, qui ne suivaient aucun thème.
 */
export function Modal({
  title,
  onClose,
  size = 'md',
  children,
}: {
  title: string;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  return (
    <SocleModal id={useId()} isOpen onModalClose={onClose} size={size}>
      <SocleModal.Header onModalClose={onClose}>{title}</SocleModal.Header>
      <SocleModal.Body>{children}</SocleModal.Body>
    </SocleModal>
  );
}

export default Modal;
