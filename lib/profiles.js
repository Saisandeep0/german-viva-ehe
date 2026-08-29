const PROFILE_DEFINITIONS = {
  sandeep: {
    id: 'sandeep',
    name: 'Sandeep',
    envPrefix: 'SANDEEP',
  },
  leela: {
    id: 'leela',
    name: 'Leela',
    envPrefix: 'LEELA',
  },
};

export function normalizeProfile(value) {
  const id = String(value || '').trim().toLowerCase();
  return PROFILE_DEFINITIONS[id] ? id : '';
}

export function getProfileConfig(value) {
  const profile = normalizeProfile(value);

  if (!profile) {
    throw new Error('Invalid profile. Choose Sandeep or Leela.');
  }

  const definition = PROFILE_DEFINITIONS[profile];
  const prefix = definition.envPrefix;

  const notionToken = String(
    process.env[`${prefix}_NOTION_TOKEN`] || ''
  ).trim();

  const geminiApiKey = String(
    process.env[`${prefix}_GEMINI_API_KEY`] || ''
  ).trim();

  const notionSourceIds = String(
    process.env[`${prefix}_NOTION_SOURCE_IDS`] || ''
  )
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    ...definition,
    notionToken,
    geminiApiKey,
    notionSourceIds,
  };
}

export function getClientProfiles() {
  return [
    { id: 'sandeep', name: 'Sandeep' },
    { id: 'leela', name: 'Leela' },
  ];
}
