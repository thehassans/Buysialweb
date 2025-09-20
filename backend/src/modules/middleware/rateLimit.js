// Lightweight in-memory rate limiter middleware
// Usage: router.use(rateLimit({ windowMs: 2000, max: 10 }))
// You can also apply per-route: router.get('/media', rateLimit({ windowMs: 10000, max: 5 }), handler)

const buckets = new Map(); // key -> { count, resetAt }

function nowMs(){ return Date.now(); }

export default function rateLimit(options = {}){
  const windowMs = Math.max(200, Number(options.windowMs) || 2000);
  const max = Math.max(1, Number(options.max) || 10);
  const keyGen = options.keyGenerator || ((req) => {
    let uid = 'anon';
    try{ if (req.user?.id) uid = String(req.user.id) }catch{}
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return `${ip}:${req.method}:${req.path}:${uid}`;
  });

  return function rateLimitMiddleware(req, res, next){
    try{
      const key = keyGen(req);
      const now = nowMs();
      let rec = buckets.get(key);
      if (!rec || now >= rec.resetAt){
        rec = { count: 0, resetAt: now + windowMs };
      }
      rec.count += 1;
      buckets.set(key, rec);

      const remaining = Math.max(0, max - rec.count);
      try{
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(rec.resetAt/1000)));
      }catch{}

      if (rec.count > max){
        const retrySec = Math.max(1, Math.ceil((rec.resetAt - now)/1000));
        try{ res.setHeader('Retry-After', String(retrySec)) }catch{}
        return res.status(429).json({ error: 'rate_limited', retryAfter: retrySec });
      }

      // Opportunistic cleanup to prevent unbounded memory growth
      if (buckets.size > 50000){
        for (const [k, v] of buckets){ if (now >= v.resetAt) buckets.delete(k); }
      }

      next();
    }catch(err){
      // On any internal error, do not block the request; just continue
      next();
    }
  }
}
