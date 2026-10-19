import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { PERMISSIONS } from '../config/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/text.js';
import { toPayload } from '../services/notification.service.js';

// One box in the header searches everything the person is allowed to see. What comes back
// is decided here, by the role in their access token - never by what the screen asks for.
// Everybody gets their own notices; the staff directory belongs to the administrator.
const PEOPLE_LIMIT = 6;
const NOTICE_LIMIT = 6;

export const search = asyncHandler(async (req, res) => {
  const { q } = req.valid.query;
  const rx = new RegExp(escapeRegex(q), 'i');
  const maySeePeople = (PERMISSIONS['users:manage'] ?? []).includes(req.user.role);

  const [notifications, users] = await Promise.all([
    Notification.find({ userId: req.user.id, $or: [{ title: rx }, { body: rx }] })
      .sort({ createdAt: -1 })
      .limit(NOTICE_LIMIT)
      .lean(),
    maySeePeople
      ? User.find({ deletedAt: null, $or: [{ name: rx }, { email: rx }] })
          .sort({ createdAt: -1 })
          .limit(PEOPLE_LIMIT)
          .lean()
      : [],
  ]);

  res.json({
    query: q,
    users: users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
    })),
    notifications: notifications.map(toPayload),
  });
});
