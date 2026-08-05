const request = require('supertest');

const app = require('./server');

describe('Server API', () => {
  const originalKey = process.env.GOOGLE_MAPS_KEY;

  afterEach(() => {
    if (originalKey == null) delete process.env.GOOGLE_MAPS_KEY;
    else process.env.GOOGLE_MAPS_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it('returns the welcome message', async () => {
    const response = await request(app).get('/');
    expect(response.statusCode).toBe(200);
    expect(response.text).toBe('PlanLi Server is running');
  });

  it('does not request rating from Google Place Details', async () => {
    process.env.GOOGLE_MAPS_KEY = 'test-key';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ status: 'OK', result: {} }),
    });

    const response = await request(app)
      .get('/api/places/details')
      .query({ placeId: 'place-1' });

    expect(response.statusCode).toBe(200);
    const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestedUrl.searchParams.get('fields')).toBe(
      'name,formatted_address,address_components,geometry,photos,place_id'
    );
  });
});
