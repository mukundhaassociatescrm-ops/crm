export interface MarketingNavLink {
  label: string;
  fragment: string;
}

export interface MarketingStat {
  value: number;
  suffix: string;
  label: string;
}

export interface MarketingService {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** TODO: Replace with CMS/API slug when content service is ready. */
  learnMoreUrl: string;
}

export interface MarketingFeature {
  title: string;
  description: string;
  icon: string;
}

export interface MarketingProcessStep {
  step: number;
  title: string;
  description: string;
}

export interface MarketingIndustry {
  name: string;
  description: string;
  icon: string;
}

export interface MarketingTestimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
}

export interface MarketingBlogPost {
  title: string;
  excerpt: string;
  category: string;
  date: string;
  /** TODO: Wire to blog detail route / CMS. */
  href: string;
}

export interface MarketingFaqItem {
  question: string;
  answer: string;
}

export interface MarketingTrustedLogo {
  name: string;
  initials: string;
}

export interface MarketingContactInfo {
  phone: string;
  email: string;
  whatsapp: string;
  address: string;
  timings: string;
}
