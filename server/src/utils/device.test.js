import { describe, expect, it } from 'vitest';
import { describeRequest, edgeLocation, resolveClient } from './device.js';

const request = (headers = {}, ip = '10.0.0.1') => ({
  ip,
  socket: { remoteAddress: ip },
  get(name) {
    return headers[String(name).toLowerCase()];
  },
});

describe('client address resolution', () => {
  it('ignores an invented X-Forwarded-For when Vercel did not send the request', () => {
    const req = request({
      'x-forwarded-for': '8.8.8.8',
      'cf-connecting-ip': '196.191.221.198',
    });

    expect(resolveClient(req)).toEqual({ ip: '196.191.221.198', via: 'cloudflare' });
  });

  it('uses the browser address Vercel overwrote, not the proxy address', () => {
    const req = request({
      'x-vercel-id': 'fra1::example',
      'x-forwarded-for': '196.191.221.198',
      'cf-connecting-ip': '76.76.21.21',
    });

    expect(resolveClient(req)).toEqual({ ip: '196.191.221.198', via: 'vercel' });
  });

  it('does not accept a private or malformed forwarded value', () => {
    const req = request(
      { 'x-forwarded-for': '10.0.0.4, not-an-address', 'cf-connecting-ip': 'not-an-address' },
      '203.0.113.9',
    );

    expect(resolveClient(req)).toEqual({ ip: '203.0.113.9', via: 'direct' });
  });

  it('parses Vercel edge place headers when they are forwarded', () => {
    const req = request({
      'x-vercel-id': 'fra1::example',
      'x-vercel-ip-country': 'ET',
      'x-vercel-ip-city': 'Addis%20Ababa',
      'x-vercel-ip-country-region': 'AA',
    });

    expect(edgeLocation(req)).toMatchObject({
      location: 'Addis Ababa, Ethiopia',
      country: 'Ethiopia',
      countryCode: 'ET',
      city: 'Addis Ababa',
      region: 'AA',
      locationSource: 'edge',
      detectionStatus: 'estimated',
    });
  });

  it('starts a sign-in as pending rather than waiting for an address lookup', () => {
    const info = describeRequest(
      request({
        'cf-connecting-ip': '196.191.221.198',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36',
      }),
    );

    expect(info.ip).toBe('196.191.221.198');
    expect(info.location).toBe('Unknown location');
    expect(info.detectionStatus).toBe('pending');
    expect(info.locationSource).toBe('none');
  });

  it('labels a local development address without pretending it is a country', () => {
    const info = describeRequest(request({}, '127.0.0.1'));

    expect(info.location).toBe('This computer');
    expect(info.detectionStatus).toBe('local');
  });
});
