import type { Action, MeResponse } from '@spoh/shared';

/** The root path of a main section; the section nav highlights one of these. */
export type SectionPath =
  '/home' | '/shift' | '/guide' | '/safety' | '/operations' | '/inbox' | '/capture';

/** Where an entry is offered as a link. An entry with none is a destination only. */
export type NavSurface =
  'section' | 'global' | 'operations' | 'station' | 'hub' | 'workspace' | 'setup';

export type OperationsGroup = 'Monitor' | 'Manage' | 'Recover & report';

export type NavStation = NonNullable<MeResponse['currentAssignment']>['station'];

export interface NavContext {
  /** May the viewer take this action here at all (`useAllows`). */
  allows: (action: Action) => boolean;
  station?: NavStation | null;
}

export interface NavEntry {
  path: string;
  label: string;
  /** The label where the full one does not fit (the 320px global bar). */
  shortLabel?: string;
  workspaceLabel?: string;
  workspaceOrder?: number;
  hint?: string;
  section: SectionPath;
  surfaces?: readonly NavSurface[];
  /** SVG path data for the section nav icon. */
  icon?: string;
  /** A section whose own page lists its screens, so those screens name it as their parent. */
  hub?: boolean;
  group?: OperationsGroup;
  emphasis?: 'primary';
  /** The action the viewer must be allowed. */
  requires?: Action;
  /** Further visibility, e.g. what the viewer's station actually does. */
  visible?(context: NavContext): boolean;
  /** A hint that depends on the viewer's station. */
  stationHint?(station: NavStation): string;
}
