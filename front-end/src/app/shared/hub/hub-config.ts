export interface HubTab {
  label: string;
  /** Child path segment under the hub base path */
  segment: string;
  /** Legacy URL segments that should highlight this tab */
  legacySegments?: string[];
  icon?: string;
  disabled?: boolean;
  comingSoon?: boolean;
}

export interface HubConfig {
  id: string;
  title: string;
  basePath: string;
  tabs: HubTab[];
}

export const COMMUNICATION_HUB: HubConfig = {
  id: 'communication',
  title: 'Communication',
  basePath: '/communication',
  tabs: [
    { label: 'Chats', segment: 'chats', legacySegments: ['manage-chat', 'chat'], icon: 'fa-comments' },
    {
      label: 'WhatsApp Campaigns',
      segment: 'whatsapp-campaigns',
      legacySegments: ['whatsapp-campaigns', 'manage-bulk-message'],
      icon: 'fa-envelopes-bulk',
    },
    {
      label: 'Campaign Tracking',
      segment: 'campaign-tracking',
      legacySegments: ['whatsapp-campaign-tracking', 'campaign-tracking'],
      icon: 'fa-chart-line',
    },
    { label: 'Bulk SMS', segment: 'bulk-sms', icon: 'fa-comment-sms' },
    { label: 'Quick SMS', segment: 'quick-sms', legacySegments: ['sms'], icon: 'fa-message' },
  ],
};

export const CUSTOMER_MANAGEMENT_HUB: HubConfig = {
  id: 'customer-management',
  title: 'Customer Management',
  basePath: '/customer-management',
  tabs: [
    { label: 'Groups', segment: 'groups', legacySegments: ['manage-group', 'groups'], icon: 'fa-user-group' },
    { label: 'Clients', segment: 'clients', icon: 'fa-address-book' },
  ],
};

/** Add tabs here when Landing Pages, Analytics, or QR Campaigns ship. */
export const MARKETING_HUB: HubConfig = {
  id: 'marketing',
  title: 'Marketing',
  basePath: '/marketing',
  tabs: [
    { label: 'Poster Management', segment: 'posters', legacySegments: ['poster-management'], icon: 'fa-image' },
  ],
};

export const HUB_CONFIGS: Record<string, HubConfig> = {
  communication: COMMUNICATION_HUB,
  'customer-management': CUSTOMER_MANAGEMENT_HUB,
  marketing: MARKETING_HUB,
};

export function getHubConfig(hubId: string): HubConfig | undefined {
  return HUB_CONFIGS[hubId];
}
