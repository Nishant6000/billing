import { APP_CONFIG } from './config.js';

const SESSION_KEY = 'ginsoft-pos-session-user';

export const sanitizeUser = (user = {}) => ({
  id: user.id,
  user_id: user.user_id,
  full_name: user.full_name,
  role: user.role,
  status: user.status || 'active'
});

export const getCurrentUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch (_) {
    return null;
  }
};

export const setCurrentUser = (user) => {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sanitizeUser(user)));
};

export const clearCurrentUser = () => sessionStorage.removeItem(SESSION_KEY);

export const canAccessRoute = (user, routeId) => {
  if (!user?.role) return false;
  const access = APP_CONFIG.roleAccess[user.role] || [];
  return access.includes('*') || access.includes(routeId);
};

export const visibleRoutesForUser = (user) =>
  APP_CONFIG.routes.filter(route => canAccessRoute(user, route.id));
