import fs from 'node:fs';
import path from 'node:path';
import pkg from '../package.json';
import { describe, expect, it } from 'vitest';

const skillPath = path.resolve('.agents/skills/stylemakar-cli/SKILL.md');

describe('repo-local StyleMakar CLI skill', () => {
  it('documents the agent workflow and is included in package files', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    expect(skill).toContain('name: stylemakar-cli');
    expect(skill).toContain('stylemakar health --json');
    expect(skill).toContain('stylemakar rewrite draft.md --out rewritten.md');
    expect(skill).toContain('stylemakar rewrite draft.md --json --debug');
    expect(skill).toContain(
      'The CLI does not currently read saved desktop-app profiles',
    );
    expect(pkg.files).toContain('.agents/skills/stylemakar-cli/SKILL.md');
    expect(skill).not.toContain('/Users/');
    expect(skill).not.toContain('Hey Tom');
  });
});
