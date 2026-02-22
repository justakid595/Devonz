import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { json, type MetaFunction } from '@remix-run/node';
import { useSearchParams, useNavigate } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { Header } from '~/components/header/Header';
import type { ShowcaseTemplate, TemplateCategory } from '~/types/showcase-template';
import { TEMPLATE_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '~/types/showcase-template';
import { loadShowcaseTemplates } from '~/utils/showcase-templates';
import { TemplatePreviewModal } from '~/components/templates/TemplatePreviewModal';

export const meta: MetaFunction = () => {
  return [
    { title: 'Templates | Devonz' },
    { name: 'description', content: 'Browse curated website templates for Devonz' },
  ];
};

export const loader = () => json({});

function TemplatesGallery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ShowcaseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ShowcaseTemplate | null>(null);

  useEffect(() => {
    loadShowcaseTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  // Handle ?selected= query param
  useEffect(() => {
    const selectedId = searchParams.get('selected');

    if (selectedId && templates.length > 0) {
      const found = templates.find((t) => t.id === selectedId);

      if (found) {
        setSelectedTemplate(found);
      }
    }
  }, [searchParams, templates]);

  const filteredTemplates = useMemo(() => {
    let result = templates;

    if (activeCategory !== 'all') {
      result = result.filter((t) => t.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [templates, activeCategory, searchQuery]);

  const handleCloseModal = useCallback(() => {
    setSelectedTemplate(null);

    // Remove ?selected= from URL
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('selected');
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleCardClick = useCallback((template: ShowcaseTemplate) => {
    setSelectedTemplate(template);
  }, []);

  const handleBackHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="i-svg-spinners:90-ring-with-bg text-3xl text-devonz-elements-loader-progress" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto modern-scrollbar" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-6">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={handleBackHome}
            className="flex items-center gap-1 text-sm text-[#9ca3af] hover:text-white transition-colors"
          >
            <div className="i-ph:arrow-left text-base" />
            Back
          </button>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Templates</h1>
        <p className="text-base text-[#9ca3af]">
          Curated templates to kickstart your next project. Preview live demos and clone with one click.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
        {/* Search Bar */}
        <div className="relative mb-4">
          <div className="i-ph:magnifying-glass text-lg text-[#9ca3af] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-white placeholder-[#666] outline-none transition-colors border border-[#333333] focus:border-[#3b82f6]"
            style={{ backgroundColor: '#1a1a1a' }}
          />
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 modern-scrollbar">
          {TEMPLATE_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 border ${
                  isActive
                    ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                    : 'bg-[#1a1a1a] text-[#9ca3af] border-[#333333] hover:bg-[#2a2a2a] hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Template Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="i-ph:magnifying-glass text-4xl text-[#333] mb-3" />
            <p className="text-[#9ca3af] text-sm">No templates found matching your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <TemplateGalleryCard key={template.id} template={template} onClick={handleCardClick} />
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <TemplatePreviewModal template={selectedTemplate} onClose={handleCloseModal} />
    </div>
  );
}

// Gallery card with screenshot preview
interface TemplateGalleryCardProps {
  template: ShowcaseTemplate;
  onClick: (template: ShowcaseTemplate) => void;
}

function TemplateGalleryCard({ template, onClick }: TemplateGalleryCardProps) {
  const iconColor = CATEGORY_COLORS[template.category] || 'text-cyan-400';

  return (
    <button
      onClick={() => onClick(template)}
      className="group text-left rounded-xl overflow-hidden transition-all duration-300 bg-[#1a1a1a] border border-[#333333] hover:border-[#444444] hover:-translate-y-0.5 hover:shadow-lg"
    >
      {/* Preview Thumbnail */}
      <div className="relative aspect-[16/10] overflow-hidden" style={{ backgroundColor: '#0a0a0a' }}>
        {template.screenshotUrl ? (
          <img
            src={template.screenshotUrl}
            alt={`${template.name} preview`}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';

              const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;

              if (fallback) {
                fallback.style.display = 'flex';
              }
            }}
          />
        ) : null}
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-2 absolute inset-0"
          style={{
            backgroundColor: '#0a0a0a',
            display: template.screenshotUrl ? 'none' : 'flex',
          }}
        >
          <div className={`${template.icon} text-4xl text-cyan-400`} />
          <span className="text-xs" style={{ color: '#9ca3af' }}>
            Preview
          </span>
        </div>
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-white/20 backdrop-blur-sm">
            <div className="i-ph:eye text-base" />
            Preview
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`${template.icon} ${iconColor} text-lg flex-shrink-0`} />
          <h3 className="text-sm font-semibold text-white truncate">{template.name}</h3>
        </div>
        <p className="text-xs text-[#9ca3af] line-clamp-2 mb-3">{template.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#2a2a2a', color: '#9ca3af' }}>
            {CATEGORY_LABELS[template.category] || template.category}
          </span>
          <div className="i-ph:arrow-right text-sm text-[#9ca3af] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </button>
  );
}

export default function TemplatesRoute() {
  return (
    <main className="flex flex-col h-full w-full" style={{ backgroundColor: '#0a0a0a' }}>
      <Header />
      <ClientOnly>{() => <TemplatesGallery />}</ClientOnly>
    </main>
  );
}
