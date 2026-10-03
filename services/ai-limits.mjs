// Server-owned limits. No client headers or configuration can raise these budgets.
export function createAiLimiter({ now = Date.now } = {}) {
  const clients = new Map();
  let globalRequests = [], active = 0;
  return {
    take(ip) {
      const time = now();
      globalRequests = globalRequests.filter(at => time - at < 3600000);
      for (const [key, times] of clients) {
        const recent = times.filter(at => time - at < 3600000);
        if (recent.length) clients.set(key, recent);
        else clients.delete(key);
      }
      const hourly = clients.get(ip) || [];
      const minute = hourly.filter(at => time - at < 60000);
      const waits = [];
      if (minute.length >= 3) waits.push(minute[0] + 60000 - time);
      if (hourly.length >= 10) waits.push(hourly[0] + 3600000 - time);
      if (globalRequests.length >= 60) waits.push(globalRequests[0] + 3600000 - time);
      if (waits.length) return { allowed: false, retryAfter: Math.max(1, Math.ceil(Math.max(...waits) / 1000)) };
      clients.set(ip, [...hourly, time]);
      globalRequests.push(time);
      return { allowed: true };
    },
    enter() { if (active >= 2) return false; active++; return true; },
    leave() { active = Math.max(0, active - 1); },
  };
}
