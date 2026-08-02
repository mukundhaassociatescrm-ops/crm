import { Routes } from '@angular/router';

/**
 * Public marketing website routes (lazy-loaded).
 * Mounted at `/website` to avoid colliding with CRM admin hub at `/marketing`.
 */
export const MARKETING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/marketing-home.component').then((m) => m.MarketingHomeComponent),
    title: 'Mukundha Associates | Tax & Business Compliance',
  },
];
