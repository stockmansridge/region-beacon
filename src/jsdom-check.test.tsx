/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import React from 'react';

describe('JSDOM Environment Check', () => {
  it('has document', () => {
    expect(globalThis.document).toBeDefined();
    const div = document.createElement('div');
    div.innerHTML = 'Hello';
    expect(div.textContent).toBe('Hello');
  });
});
