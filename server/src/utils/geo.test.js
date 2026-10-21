import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPrivateAddress, locationResult, lookupAddress, UNKNOWN_LOCATION } from './geo.js';

const reply = (body) => ({
  ok: true,
  json: async () => body,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('address lookup', () => {
  it('keeps the canonical country, city and region together', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply({
          success: true,
          country: 'Ethiopia',
          country_code: 'ET',
          city: 'Addis Ababa',
          region: 'Addis Ababa',
          connection: { org: 'Ethio Telecom', isp: 'Ethio Telecom', domain: 'ethiotelecom.et' },
        }),
      ),
    );

    const place = await lookupAddress('198.51.100.23');

    expect(place).toMatchObject({
      location: 'Addis Ababa, Ethiopia',
      country: 'Ethiopia',
      countryCode: 'ET',
      city: 'Addis Ababa',
      region: 'Addis Ababa',
      locationSource: 'network',
      detectionStatus: 'estimated',
    });
    expect(place.detectedAt).toBeInstanceOf(Date);
  });

  it('refuses to show a data-centre address as the person\'s place', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply({
          success: true,
          country: 'France',
          country_code: 'FR',
          city: 'Paris',
          region: 'Ile-de-France',
          connection: { org: 'Amazon Data Services France', isp: 'Amazon.com, Inc.', domain: 'amazon.com' },
        }),
      ),
    );

    const place = await lookupAddress('203.0.113.77');

    expect(place).toMatchObject({
      location: UNKNOWN_LOCATION,
      country: '',
      countryCode: '',
      city: '',
      region: '',
      detectionStatus: 'proxy',
    });
  });

  it('returns Unknown location when the provider and the bundled database have nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const place = await lookupAddress('192.0.2.44');

    expect(place.location).toBe(UNKNOWN_LOCATION);
    expect(place.detectionStatus).toBe('unavailable');
    expect(place.locationSource).toBe('none');
  });

  it('does not invent a country for a private address', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const place = await lookupAddress('10.0.0.8');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(place).toMatchObject({
      location: 'Local network',
      detectionStatus: 'local',
      locationSource: 'local',
    });
  });

  it('normalises malformed fields instead of trusting the provider', () => {
    expect(
      locationResult({
        countryCode: 'not-a-code',
        city: '  Addis Ababa  ',
        country: 'Ethiopia',
      }),
    ).toMatchObject({
      location: 'Addis Ababa, Ethiopia',
      countryCode: '',
      city: 'Addis Ababa',
    });
  });

  it('recognises private ranges', () => {
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('196.191.221.198')).toBe(false);
  });
});
