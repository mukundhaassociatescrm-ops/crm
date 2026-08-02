import {
  MarketingBlogPost,
  MarketingContactInfo,
  MarketingFaqItem,
  MarketingFeature,
  MarketingIndustry,
  MarketingNavLink,
  MarketingProcessStep,
  MarketingService,
  MarketingStat,
  MarketingTestimonial,
  MarketingTrustedLogo,
} from '../models/marketing.models';

/** Dummy marketing content — TODO: replace with API/CMS integration. */
export const MARKETING_BRAND = {
  name: 'Mukundha Associates',
  tagline: 'Chartered Accountants & Business Advisors',
  legalName: 'Mukundha Associates',
  logoPath: 'assets/images/logo.png',
  logoAlt: 'Mukundha Associates logo',
};

export const MARKETING_NAV_LINKS: MarketingNavLink[] = [
  { label: 'Services', fragment: 'services' },
  { label: 'Why Us', fragment: 'why-us' },
  { label: 'Process', fragment: 'process' },
  { label: 'Industries', fragment: 'industries' },
  { label: 'Insights', fragment: 'insights' },
  { label: 'FAQ', fragment: 'faq' },
  { label: 'Contact', fragment: 'contact' },
];

export const MARKETING_STATS: MarketingStat[] = [
  { value: 15, suffix: '+', label: 'Years experience' },
  { value: 1200, suffix: '+', label: 'Returns filed yearly' },
  { value: 98, suffix: '%', label: 'On-time compliance' },
  { value: 40, suffix: '+', label: 'Business clients' },
];

export const MARKETING_TRUSTED: MarketingTrustedLogo[] = [
  { name: 'Nexus Retail', initials: 'NR' },
  { name: 'Orbit Tech', initials: 'OT' },
  { name: 'Summit Care', initials: 'SC' },
  { name: 'BrightPath Edu', initials: 'BE' },
  { name: 'Forge Works', initials: 'FW' },
  { name: 'Pulse Startups', initials: 'PS' },
];

export const MARKETING_SERVICES: MarketingService[] = [
  {
    id: 'itr',
    title: 'Income Tax Filing',
    description: 'Accurate ITR preparation for individuals and businesses with proactive planning and scrutiny-ready documentation.',
    icon: 'fa-solid fa-file-invoice-dollar',
    learnMoreUrl: '#contact',
  },
  {
    id: 'gst',
    title: 'GST Compliance',
    description: 'End-to-end GST registration, returns, reconciliations, and notice handling so your cash flow stays predictable.',
    icon: 'fa-solid fa-receipt',
    learnMoreUrl: '#contact',
  },
  {
    id: 'accounting',
    title: 'Accounting & Bookkeeping',
    description: 'Clean books, monthly closings, and management reports that give founders clarity without the spreadsheet chaos.',
    icon: 'fa-solid fa-book',
    learnMoreUrl: '#contact',
  },
  {
    id: 'audit',
    title: 'Audit & Assurance',
    description: 'Statutory and internal audits designed to strengthen controls while keeping operations moving.',
    icon: 'fa-solid fa-shield-halved',
    learnMoreUrl: '#contact',
  },
  {
    id: 'advisory',
    title: 'Tax Advisory',
    description: 'Structuring, deductions, and scenario planning so every decision is tax-aware before you commit capital.',
    icon: 'fa-solid fa-lightbulb',
    learnMoreUrl: '#contact',
  },
  {
    id: 'startup',
    title: 'Startup Compliance',
    description: 'Incorporation support, ROC filings, and compliance calendars built for fast-moving founding teams.',
    icon: 'fa-solid fa-rocket',
    learnMoreUrl: '#contact',
  },
];

export const MARKETING_FEATURES: MarketingFeature[] = [
  {
    title: 'Trusted advisors',
    description: 'Partner-led reviews on every engagement—not templates handed off to an anonymous queue.',
    icon: 'fa-solid fa-user-tie',
  },
  {
    title: 'Fast, on-time filing',
    description: 'Structured workflows and reminder systems that keep GST and ITR deadlines off your critical path.',
    icon: 'fa-solid fa-bolt',
  },
  {
    title: 'Business-first clarity',
    description: 'Plain-language recommendations with the numbers behind them, so finance and founders stay aligned.',
    icon: 'fa-solid fa-chart-line',
  },
  {
    title: 'Secure digital process',
    description: 'Encrypted document exchange and tracked checklists—no chasing WhatsApp threads for missing proofs.',
    icon: 'fa-solid fa-lock',
  },
];

export const MARKETING_PROCESS: MarketingProcessStep[] = [
  {
    step: 1,
    title: 'Discover',
    description: 'We map your entity type, filings, and risk areas in a focused kickoff call.',
  },
  {
    step: 2,
    title: 'Organize',
    description: 'A tailored checklist and secure upload vault collect everything once—cleanly.',
  },
  {
    step: 3,
    title: 'Execute',
    description: 'Our team prepares, reviews, and files with partner oversight at every milestone.',
  },
  {
    step: 4,
    title: 'Advise',
    description: 'You receive a clear summary, next actions, and planning notes for the quarter ahead.',
  },
];

export const MARKETING_INDUSTRIES: MarketingIndustry[] = [
  { name: 'Manufacturing', description: 'Inventory, capital assets, and GST complexity handled with operational empathy.', icon: 'fa-solid fa-industry' },
  { name: 'Retail', description: 'Multi-location GST, POS reconciliations, and seasonal cash-flow planning.', icon: 'fa-solid fa-store' },
  { name: 'IT & SaaS', description: 'Export benefits, ESOP nuances, and recurring revenue reporting done right.', icon: 'fa-solid fa-laptop-code' },
  { name: 'Healthcare', description: 'Clinic and hospital compliance with sensitive documentation discipline.', icon: 'fa-solid fa-heart-pulse' },
  { name: 'Education', description: 'Trusts, societies, and institutions with transparent grant and fee accounting.', icon: 'fa-solid fa-graduation-cap' },
  { name: 'Startups', description: 'From DPIIT to first audit—compliance that scales with your runway.', icon: 'fa-solid fa-seedling' },
];

export const MARKETING_TESTIMONIALS: MarketingTestimonial[] = [
  {
    quote: 'They turned our GST chaos into a calm monthly rhythm. Notices dropped, and our board finally trusts the numbers.',
    name: 'Ananya Krishnan',
    role: 'Founder',
    company: 'Orbit Tech',
  },
  {
    quote: 'Partner-level attention without the big-firm delay. Filings are early, advice is practical, and the portal is painless.',
    name: 'Vikram Sethi',
    role: 'CFO',
    company: 'Forge Works',
  },
  {
    quote: 'As a multi-outlet retailer, reconciliations used to consume weeks. Mukundha Associates made it a predictable process.',
    name: 'Meera Nair',
    role: 'Operations Head',
    company: 'Nexus Retail',
  },
];

export const MARKETING_BLOG_POSTS: MarketingBlogPost[] = [
  {
    title: 'GST reconciliation checklist before GSTR-9',
    excerpt: 'A practical month-end sequence that catches ITC mismatches before annual return season.',
    category: 'GST',
    date: '2026-07-18',
    href: '#contact',
  },
  {
    title: 'ITR for freelancers: deductions worth documenting',
    excerpt: 'What holds up under scrutiny—and what usually gets disallowed without proof.',
    category: 'Income Tax',
    date: '2026-07-02',
    href: '#contact',
  },
  {
    title: 'Startup compliance calendar for the first 18 months',
    excerpt: 'ROC, tax, and labour milestones sequenced so founders do not miss silent deadlines.',
    category: 'Startups',
    date: '2026-06-20',
    href: '#contact',
  },
];

export const MARKETING_FAQS: MarketingFaqItem[] = [
  {
    question: 'Who do you typically work with?',
    answer: 'Founders, growing SMEs, and professionals who want reliable compliance with proactive tax planning—not just last-minute filings.',
  },
  {
    question: 'How quickly can you onboard a new client?',
    answer: 'Most engagements start within 3–5 business days after the kickoff call and document vault setup.',
  },
  {
    question: 'Do you support both GST and income tax?',
    answer: 'Yes. We cover GST, income tax, accounting, audit support, and advisory under one coordinated team.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Documents are exchanged through controlled channels with access limited to your engagement team. We never share client data across mandates.',
  },
  {
    question: 'Can you work remotely with our team?',
    answer: 'Absolutely. Most clients operate fully remote with scheduled reviews over video and a shared compliance tracker.',
  },
];

export const MARKETING_CONTACT: MarketingContactInfo = {
  phone: '+91 85081 69948',
  email: 'tpksathyan@gmail.com',
  whatsapp: '918508169948',
  address: '3rd Floor, 73-27 TF7, Block C, Swamy Iyer New Street, Katteri Chettiar Thottam, Coimbatore - 641001',
  timings: 'Mon–Sat · 9:30 AM – 6:30 PM IST',
};
