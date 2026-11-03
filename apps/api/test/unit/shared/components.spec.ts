import { component, componentSchemas } from '../../../src/shared/components.js';

describe('component', () => {
  afterEach(() => {
    delete componentSchemas.Clash;
  });

  it('returns the $ref and accepts the same schema again', () => {
    const schema = { type: 'string' } as const;

    expect(component('Clash', schema)).toEqual({
      $ref: '#/components/schemas/Clash',
    });
    expect(component('Clash', schema)).toEqual({
      $ref: '#/components/schemas/Clash',
    });
  });

  it('throws when the name already holds a different schema', () => {
    component('Clash', { type: 'string' });

    expect(() => component('Clash', { type: 'number' })).toThrow(
      '"Clash" is already registered',
    );
  });
});
