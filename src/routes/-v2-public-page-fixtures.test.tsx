import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock the router hooks that cause failure
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router');
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
    useNavigate: () => vi.fn(),
    Link: ({ children }: any) => <a>{children}</a>,
  };
});

// Mock other problematic hooks if any
vi.mock('@/components/public-nav-context', () => ({
  PublicLink: ({ children }: any) => <a>{children}</a>,
  PublicNavProvider: ({ children }: any) => <div>{children}</div>,
  usePublicNav: () => ({ mode: 'preview', subdomain: null, activePath: '/offers', previewFeatures: { hasFaq: true, hasMap: true, hasAwards: true } }),
}));

import { PublicOffersPage } from './live.$subdomain.offers';

describe('PublicOffersPage Fixture Test', () => {
  const mockEvent = {
    event_id: 'event-123',
    name: 'Test Wine Trail',
    primary_color: '#1F3D2B',
    accent_color: '#D4AF37',
    venue_label_singular: 'Winery',
    venue_label_plural: 'Wineries',
  };

  const mockOffers = [
    {
      venue_id: 'venue-1',
      name: 'Estate Winery',
      offer_summary: '2-for-1 Tasting\nEnjoy two tastings for the price of one.',
      offer_display_icon: 'wine',
      offer_display_colour: '#1F3D2B',
      event_found: true,
    }
  ];

  it('renders the offers page with fixtures correctly', () => {
    const html = renderToStaticMarkup(
      <PublicOffersPage 
        subdomain="test" 
        previewData={{ event: mockEvent as any, offers: mockOffers as any }} 
      />
    );
    
    expect(html).toContain('Test Wine Trail');
    expect(html).toContain('Special Offers');
    expect(html).toContain('Estate Winery');
    expect(html).toContain('2-for-1 Tasting');
    expect(html).toContain('Enjoy two tastings for the price of one.');
  });
});
