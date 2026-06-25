import crypto from 'crypto';
import { cookieOptions } from './env.js';

const sessions = new Map();

export function sessionMiddleware(req, res, next) {
  const sessionId = req.cookies?.session_id;
  if (sessionId && sessions.has(sessionId)) {
    req.session = sessions.get(sessionId);
    req.sessionId = sessionId;
  } else {
    req.session = { user: null };
  }

  req.persistSession = () => {
    if (!req.session?.user) {
      return;
    }

    const id = req.sessionId || crypto.randomBytes(24).toString('hex');
    req.sessionId = id;
    sessions.set(id, req.session);
    res.cookie('session_id', id, {
      ...cookieOptions(),
      maxAge: 24 * 60 * 60 * 1000,
    });
  };

  req.clearSession = () => {
    if (req.sessionId) {
      sessions.delete(req.sessionId);
    }
    res.clearCookie('session_id', cookieOptions());
    req.session = { user: null };
    req.sessionId = undefined;
  };

  next();
}

export function clearSessionsForTests() {
  sessions.clear();
}
