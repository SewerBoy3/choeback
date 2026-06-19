export function parseMusicSource(url, sourceType = 'auto') {
  if (!url?.trim()) return null;

  const raw = url.trim();

  const spotify = raw.match(
    /open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/i
  );
  if (spotify && (sourceType === 'auto' || sourceType === 'spotify')) {
    const kind = spotify[1].toLowerCase();
    const id = spotify[2];
    return {
      source_type: 'spotify',
      embed_url: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`,
      audio_url: raw,
    };
  }

  const yt = raw.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  if (yt && (sourceType === 'auto' || sourceType === 'youtube')) {
    return {
      source_type: 'youtube',
      embed_url: `https://www.youtube.com/embed/${yt[1]}`,
      audio_url: raw,
    };
  }

  if (sourceType === 'auto' || sourceType === 'audio_link') {
    return {
      source_type: 'audio_link',
      audio_url: raw,
      embed_url: null,
    };
  }

  return null;
}

export function parseSectionsJson(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function formatSongForClient(cancion) {
  const sections = parseSectionsJson(cancion.sections);
  const tipo =
    cancion.source_type === 'spotify'
      ? 'spotify'
      : cancion.source_type === 'youtube'
        ? 'youtube'
        : 'audio';

  const embedHeight =
    tipo === 'spotify'
      ? cancion.embed_url?.includes('/album/') || cancion.embed_url?.includes('/playlist/')
        ? 352
        : 152
      : tipo === 'youtube'
        ? 200
        : 0;

  return {
    id: `song-${cancion.id}`,
    dbId: cancion.id,
    type,
    name: cancion.title,
    artist: cancion.artist || '',
    description: cancion.description || '',
    coverUrl: cancion.cover_url,
    url: cancion.audio_url,
    embedUrl: cancion.embed_url,
    source: 'library',
    lyrics: cancion.lyrics || '',
    sections,
    sortOrder: cancion.sort_order,
    embedHeight,
    isPublished: cancion.is_published,
  };
}
