import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

describe('Test Environment Check', () => {
  it('can render to static markup', () => {
    const html = renderToStaticMarkup(<div>Hello</div>);
    expect(html).toBe('<div>Hello</div>');
  });
});
