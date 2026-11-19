import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

/**
 * Onglets du socle (`nav nav-tabs` + `nav-link`/`selected`), comme l'agenda et le blog.
 * Remplace les groupes de boutons pleins : l'onglet retenu se marque par la couleur secondaire
 * et le filet du thème, sans couleur écrite en dur dans le module.
 */

export interface RouteTab {
  to: string;
  label: string;
  /** Ne retient l'onglet que sur la route exacte (l'accueil, sinon toujours actif). */
  end?: boolean;
  icon?: ReactNode;
}

/** Onglets qui changent de page. */
export function RouteTabs({ tabs, label }: { tabs: RouteTab[]; label: string }) {
  return (
    <ul className="nav nav-tabs" aria-label={label}>
      {tabs.map((tab) => (
        <li className="nav-item" key={tab.to}>
          <NavLink
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`}
          >
            {tab.icon}
            {tab.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export interface ViewTab<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/** Onglets qui changent d'affichage à l'intérieur d'un écran (calendaire / liste, jour / semaine…). */
export function ViewTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: ViewTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <ul className="nav nav-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <li className="nav-item" key={tab.value} role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={value === tab.value}
            className={`nav-link ${value === tab.value ? 'selected' : ''}`}
            onClick={() => onChange(tab.value)}
          >
            {tab.icon}
            {tab.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
