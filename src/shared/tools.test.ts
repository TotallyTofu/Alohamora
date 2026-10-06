import { describe, expect, it } from 'vitest';
import { TOOLS, toolMeta, toolsFor } from './tools';
import { TOOL_DEFAULTS, withDefaults } from './toolOptions';
import type { ToolId } from './types';

describe('toolsFor', () => {
  it('video with one file: 9 tools, compress first, no join', () => {
    const t = toolsFor('video', 1);
    expect(t).toHaveLength(9);
    expect(t[0].id).toBe('video.compress');
    expect(t.map((x) => x.id)).not.toContain('video.join');
  });

  it('video with two files: join in, trim out', () => {
    const ids = toolsFor('video', 2).map((x) => x.id);
    expect(ids).toContain('video.join');
    expect(ids).not.toContain('video.trim');
  });

  it('epub has no tools', () => {
    expect(toolsFor('epub', 1)).toEqual([]);
  });
});

describe('registry consistency', () => {
  it('every TOOL_DEFAULTS key is a registered tool and vice versa', () => {
    const defaultKeys = Object.keys(TOOL_DEFAULTS).sort();
    const toolIds = TOOLS.map((t) => t.id as string).sort();
    expect(defaultKeys).toEqual(toolIds);
  });

  it('toolMeta throws for unknown ids and returns known ones', () => {
    expect(toolMeta('video.mute').instant).toBe(true);
    expect(() => toolMeta('nope' as ToolId)).toThrow();
  });

  it('withDefaults merges shallowly over defaults', () => {
    const o = withDefaults<{ preset: string; codec: string }>('video.compress', { preset: 'small' });
    expect(o.preset).toBe('small');
    expect(o.codec).toBe('h264');
  });
});
