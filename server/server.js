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
    const GOOGLE_MAPS_KEY = getGoogleMapsKey();
    if (!GOOGLE_MAPS_KEY) {
      return res.status(500).json({ error: 'Missing GOOGLE_MAPS_KEY on server' });
    }

    const input = String(req.query.input || '').trim();
    if (input.length < 2) return res.json({ predictions: [] });

    console.log('[places/autocomplete]', { inputLength: input.length });

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('types', '(cities)');
    url.searchParams.set('language', 'iw');
    url.searchParams.set('key', GOOGLE_MAPS_KEY);

    const response = await fetch(url);
    const data = await response.json();

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

app.get('/api/places/details', async (req, res) => {
  try {
    const GOOGLE_MAPS_KEY = getGoogleMapsKey();
    if (!GOOGLE_MAPS_KEY) {
      return res.status(500).json({ error: 'Missing GOOGLE_MAPS_KEY on server' });
    }

    const placeId = String(req.query.placeId || '').trim();
    if (!placeId) return res.status(400).json({ error: 'Missing placeId' });

    console.log('[places/details]', { placeIdLength: placeId.length });

    const fields = String(req.query.fields || 'name,formatted_address,address_components,geometry,photos,rating,place_id');

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', fields);
    url.searchParams.set('language', 'iw');
    url.searchParams.set('key', GOOGLE_MAPS_KEY);

    const response = await fetch(url);
    const data = await response.json();

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
