// This file is used to load and return agent templates.

export const loadTemplate = (templateId: string) => {
  switch (templateId) {
    case 'validator-v1':
      return { type: 'validator', entry: './templates/validator.ts' };
    case 'signal-emitter-basic':
      return { type: 'signal', entry: './templates/emitter.ts' };
    default:
      throw new Error('Template not found: ' + templateId);
  }
};
