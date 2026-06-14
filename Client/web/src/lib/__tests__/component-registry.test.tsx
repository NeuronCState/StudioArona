import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  registry,
  registerComponent,
  getComponent,
  DynamicRender,
} from '../component-registry';

function TestCard({ title }: { title?: string }) {
  return <div data-testid="test-card">{title ?? 'fallback'}</div>;
}

describe('component-registry', () => {
  beforeEach(() => {
    registry.clear();
  });

  it('registers and retrieves a component', () => {
    registerComponent('TestCard', TestCard);
    const Comp = getComponent('TestCard');
    expect(Comp).toBe(TestCard);
  });

  it('returns undefined for unknown component', () => {
    expect(getComponent('Unknown')).toBeUndefined();
  });

  it('DynamicRender renders registered component', () => {
    registerComponent('TestCard', TestCard);
    render(<DynamicRender name="TestCard" props={{ title: 'Hello' }} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('DynamicRender shows fallback for unknown component', () => {
    render(<DynamicRender name="UnknownCard" props={{}} />);
    expect(screen.getByText(/Unknown component/)).toBeInTheDocument();
  });
});
