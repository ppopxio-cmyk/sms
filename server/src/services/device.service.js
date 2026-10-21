import { KnownDevice } from '../models/KnownDevice.js';

// A browser we have not seen sign in from before. A fingerprint alone is not proof
// of anything, so this only ever decides whether to email one extra code.
export async function isNewDevice(userId, key) {
  return !(await KnownDevice.exists({ userId, key }));
}

export async function rememberDevice({ userId, key, info }) {
  const {
    browser,
    os,
    deviceType,
    deviceName,
    deviceModelSource,
    ip,
    location,
    locationSource,
    country,
    countryCode,
    city,
    region,
    detectionStatus,
    detectedAt,
  } = info ?? {};
  await KnownDevice.updateOne(
    { userId, key },
    {
      $set: {
        browser,
        os,
        deviceType,
        deviceName,
        deviceModelSource,
        ip,
        location,
        locationSource,
        country,
        countryCode,
        city,
        region,
        detectionStatus,
        detectedAt,
        lastSeenAt: new Date(),
      },
      $setOnInsert: { firstSeenAt: new Date() },
    },
    { upsert: true },
  );
}

export async function forgetDevicesForUser(userId) {
  await KnownDevice.deleteMany({ userId });
}
