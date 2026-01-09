require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

const getGoogleMapsKey = () => process.env.GOOGLE_MAPS_KEY;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('PlanLi Server is running');
});

// --- Google Places proxy (for web; avoids browser CORS) ---
app.get('/api/places/autocomplete', async (req, res) => {
  try {
    const startedAt = Date.now();
    const GOOGLE_MAPS_KEY = getGoogleMapsKey();
    if (!GOOGLE_MAPS_KEY) {
      console.warn('[places/autocomplete] missing GOOGLE_MAPS_KEY');
      return res.status(500).json({ error: 'Missing GOOGLE_MAPS_KEY on server' });
    }

    const input = String(req.query.input || '').trim();
    if (input.length < 2) return res.json({ predictions: [] });

    const rawTypes = String(req.query.types ?? '(cities)').trim();

    console.log('[places/autocomplete] request', {
      inputLength: input.length,
      inputPreview: input.slice(0, 32),
      types: rawTypes,
    });

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);

    // Default to cities for existing callers, but allow broader searches (e.g. exact places)
    // by passing types=all (omit types) or a specific Places type (e.g. establishment).
    const types = rawTypes.toLowerCase() === 'all' ? '' : rawTypes;
    if (types) {
      url.searchParams.set('types', types);
    }
    url.searchParams.set('language', 'he');
    url.searchParams.set('key', GOOGLE_MAPS_KEY);

    const response = await fetch(url);
    const data = await response.json();

    console.log('[places/autocomplete] response', {
      status: data?.status,
      predictions: Array.isArray(data?.predictions) ? data.predictions.length : undefined,
      durationMs: Date.now() - startedAt,
    });

    if (data?.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('[places/autocomplete] upstream status', {
        status: data.status,
        error_message: data.error_message,
      });
    }
    return res.json(data);
  } catch (e) {
    console.error('[places/autocomplete] failed', e);
    return res.status(500).json({ error: 'places_autocomplete_failed' });
  }
});

// Places Text Search proxy (useful fallback for general queries like "barbershop cusco")
app.get('/api/places/textsearch', async (req, res) => {
  try {
    const startedAt = Date.now();
    const GOOGLE_MAPS_KEY = getGoogleMapsKey();
    if (!GOOGLE_MAPS_KEY) {
      console.warn('[places/textsearch] missing GOOGLE_MAPS_KEY');
      return res.status(500).json({ error: 'Missing GOOGLE_MAPS_KEY on server' });
    }

    const queryText = String(req.query.query || '').trim();
    if (queryText.length < 2) return res.json({ results: [], status: 'ZERO_RESULTS' });

    console.log('[places/textsearch] request', {
      queryLength: queryText.length,
      queryPreview: queryText.slice(0, 32),
    });

    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', queryText);
    url.searchParams.set('language', 'he');
    url.searchParams.set('key', GOOGLE_MAPS_KEY);

    const response = await fetch(url);
    const data = await response.json();

    console.log('[places/textsearch] response', {
      status: data?.status,
      results: Array.isArray(data?.results) ? data.results.length : undefined,
      durationMs: Date.now() - startedAt,
    });

    if (data?.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('[places/textsearch] upstream status', {
        status: data.status,
        error_message: data.error_message,
      });
    }

    return res.json(data);
  } catch (e) {
    console.error('[places/textsearch] failed', e);
    return res.status(500).json({ error: 'places_textsearch_failed' });
  }
});

app.get('/api/places/details', async (req, res) => {
  try {
    const startedAt = Date.now();
    const GOOGLE_MAPS_KEY = getGoogleMapsKey();
    if (!GOOGLE_MAPS_KEY) {
      console.warn('[places/details] missing GOOGLE_MAPS_KEY');
      return res.status(500).json({ error: 'Missing GOOGLE_MAPS_KEY on server' });
    }

    const placeId = String(req.query.placeId || '').trim();
    if (!placeId) return res.status(400).json({ error: 'Missing placeId' });

    console.log('[places/details] request', { placeIdLength: placeId.length });

    const fields = String(req.query.fields || 'name,formatted_address,address_components,geometry,photos,rating,place_id');

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', fields);
    url.searchParams.set('language', 'he');
    url.searchParams.set('key', GOOGLE_MAPS_KEY);

    const response = await fetch(url);
    const data = await response.json();

    console.log('[places/details] response', {
      status: data?.status,
      durationMs: Date.now() - startedAt,
    });

    if (data?.status && data.status !== 'OK') {
      console.warn('[places/details] upstream status', {
        status: data.status,
        error_message: data.error_message,
      });
    }
    return res.json(data);
  } catch (e) {
    console.error('[places/details] failed', e);
    return res.status(500).json({ error: 'places_details_failed' });
  }
});

app.listen(PORT, () => {
  console.log('GOOGLE_MAPS_KEY configured:', Boolean(getGoogleMapsKey()));
  console.log(`Server running on port ${PORT}`);
});
