export interface SidebarNavItem {
  label: string;
  route: string;
  icon: string;
  /** Additional URL prefixes that should highlight this item */
  matchPrefixes?: string[];
}

export interface SidebarNavSection {
  id: string;
  label: string;
  icon: string;
  items: SidebarNavItem[];
  /** Visible only to primary admin (not temporary admin) */
  primaryAdminOnly?: boolean;
}

export interface SidebarNavLink {
  label: string;
  route: string;
  icon: string;
  matchPrefixes?: string[];
  primaryAdminOnly?: boolean;
}

export const SIDEBAR_SECTIONS: SidebarNavSection[] = [
  {
    id: 'communication',
    label: 'Communication',
    icon: 'fa-bullhorn',
    items: [
      { label: 'Chats', route: '/communication/chats', icon: 'fa-comments', matchPrefixes: ['/communication/chats', '/manage-chat', '/chat'] },
      { label: 'WhatsApp Campaigns', route: '/communication/whatsapp-campaigns', icon: 'fa-envelopes-bulk', matchPrefixes: ['/communication/whatsapp-campaigns', '/whatsapp-campaigns', '/manage-bulk-message'] },
      { label: 'Campaign Tracking', route: '/communication/campaign-tracking', icon: 'fa-chart-line', matchPrefixes: ['/communication/campaign-tracking', '/whatsapp-campaign-tracking', '/campaign-tracking'] },
      { label: 'Bulk SMS', route: '/communication/bulk-sms', icon: 'fa-comment-sms', matchPrefixes: ['/communication/bulk-sms', '/bulk-sms'] },
      { label: 'Quick SMS', route: '/communication/quick-sms', icon: 'fa-message', matchPrefixes: ['/communication/quick-sms', '/sms'] },
    ],
  },
  {
    id: 'customer-management',
    label: 'Customer Management',
    icon: 'fa-users',
    items: [
      { label: 'Clients', route: '/customer-management/clients', icon: 'fa-address-book', matchPrefixes: ['/customer-management/clients', '/clients'] },
      { label: 'Groups', route: '/customer-management/groups', icon: 'fa-user-group', matchPrefixes: ['/customer-management/groups', '/manage-group', '/groups'] },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: 'fa-arrow-trend-up',
    items: [
      { label: 'Poster Management', route: '/marketing/posters', icon: 'fa-image', matchPrefixes: ['/marketing/posters', '/poster-management'] },
    ],
  },
];

export const SIDEBAR_STANDALONE_LINKS: SidebarNavLink[] = [
  { label: 'Tasks', route: '/manage-task', icon: 'fa-clipboard-check', matchPrefixes: ['/manage-task'], primaryAdminOnly: true },
  { label: 'Employees', route: '/manage-employee', icon: 'fa-user-tie', matchPrefixes: ['/manage-employee'], primaryAdminOnly: true },
  { label: 'Reports', route: '/manage-report', icon: 'fa-file-invoice', matchPrefixes: ['/manage-report'] },
  { label: 'Work History', route: '/work-history', icon: 'fa-timeline', matchPrefixes: ['/work-history'] },
];

export const SIDEBAR_DASHBOARD_LINK: SidebarNavLink = {
  label: 'Dashboard',
  route: '/dashboard',
  icon: 'fa-gauge-high',
  matchPrefixes: ['/dashboard'],
};

export function urlMatchesNavItem(url: string, item: SidebarNavItem | SidebarNavLink): boolean {
  const path = url.split('?')[0];
  if (path === item.route || path.startsWith(item.route + '/')) {
    return true;
  }
  for (const prefix of item.matchPrefixes || []) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      return true;
    }
  }
  return false;
}

export function findActiveSectionId(url: string): string | null {
  for (const section of SIDEBAR_SECTIONS) {
    if (section.items.some((item) => urlMatchesNavItem(url, item))) {
      return section.id;
    }
  }
  return null;
}
