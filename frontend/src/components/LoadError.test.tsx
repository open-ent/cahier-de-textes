import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadError } from './LoadError';

describe('LoadError', () => {
  it("n'affiche rien quand le chargement a réussi", () => {
    const { container } = render(<LoadError failed={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche une alerte quand le chargement échoue (au lieu d'un faux « aucune séance »)", () => {
    render(<LoadError failed />);
    expect(screen.getByRole('alert').textContent).toMatch(/échoué|failed/i);
  });
});
