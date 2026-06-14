import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cn, formatRelativeTime, formatCountdown } from './utils';

describe('cn', () => {
  it('merges multiple class strings', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('resolves Tailwind conflicts (later class wins)', () => {
    expect(cn('px-4', 'px-8')).toBe('px-8');
  });

  it('handles conditional classes via clsx', () => {
    const hide = false;
    expect(cn('base', hide && 'hidden', 'extra')).toBe('base extra');
  });

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('');
  });

  it('handles arrays and objects', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "刚刚" for less than 1 minute ago', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    const thirtySecondsAgo = new Date(now.getTime() - 30_000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo)).toBe('刚刚');
  });

  it('returns "X 分钟前" for minutes ago', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5 分钟前');

    const fiftyNineMinAgo = new Date(now.getTime() - 59 * 60_000).toISOString();
    expect(formatRelativeTime(fiftyNineMinAgo)).toBe('59 分钟前');
  });

  it('returns "X 小时前" for hours ago', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe('2 小时前');

    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 3_600_000).toISOString();
    expect(formatRelativeTime(twentyThreeHoursAgo)).toBe('23 小时前');
  });

  it('returns "X 天前" for days ago', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000).toISOString();
    expect(formatRelativeTime(threeDaysAgo)).toBe('3 天前');
  });
});

describe('formatCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "已过期" for past due dates', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    const pastDue = new Date(now.getTime() - 1000).toISOString();
    expect(formatCountdown(pastDue)).toBe('已过期');
  });

  it('returns "Xh Xm" for less than 24 hours remaining', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    // 2 hours 30 minutes from now
    const due = new Date(now.getTime() + 2 * 3_600_000 + 30 * 60_000).toISOString();
    expect(formatCountdown(due)).toBe('2h 30m');
  });

  it('returns "X 天 Xh" for 24+ hours remaining', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    // 2 days 5 hours from now
    const due = new Date(now.getTime() + 2 * 86_400_000 + 5 * 3_600_000).toISOString();
    expect(formatCountdown(due)).toBe('2 天 5h');
  });

  it('returns "0h 0m" for exactly now', () => {
    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    expect(formatCountdown(now.toISOString())).toBe('0h 0m');
  });
});
