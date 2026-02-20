export type TemplateCategory = 'landing-page' | 'portfolio' | 'online-store' | 'dashboard' | 'saas' | 'ai-app';

export interface ShowcaseTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  vercelUrl: string;
  githubRepo: string;
  screenshotUrl?: string;
  tags: string[];
  icon: string;
}

export interface TemplateCategoryInfo {
  id: TemplateCategory | 'all';
  label: string;
  description: string;
}

export const TEMPLATE_CATEGORIES: TemplateCategoryInfo[] = [
  { id: 'all', label: 'All', description: 'Browse all templates' },
  { id: 'landing-page', label: 'Landing Pages', description: 'Marketing sites and promotional pages' },
  { id: 'portfolio', label: 'Portfolio', description: 'Personal and agency portfolio sites' },
  { id: 'online-store', label: 'Online Store', description: 'E-commerce and product pages' },
  { id: 'dashboard', label: 'Dashboard', description: 'Admin panels and analytics dashboards' },
  { id: 'saas', label: 'SaaS', description: 'Software as a service applications' },
  { id: 'ai-app', label: 'AI Apps', description: 'AI-powered tools and applications' },
];
