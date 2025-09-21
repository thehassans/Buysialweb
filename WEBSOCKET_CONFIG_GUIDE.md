# WebSocket Configuration Guide for BuySial Commerce

## Environment Variables for Production

Add these environment variables in Plesk (Domains → Node.js → Environment variables):

```bash
# Socket.IO Configuration
SOCKET_IO_PING_TIMEOUT=60000          # 60 seconds (increased from 30s)
SOCKET_IO_PING_INTERVAL=25000         # 25 seconds (increased from 20s)
SOCKET_IO_CONNECT_TIMEOUT=20000       # 20 seconds connection timeout
SOCKET_IO_MAX_BUFFER=1048576          # 1MB buffer size
SOCKET_IO_UPGRADE_TIMEOUT=10000       # 10 seconds for WebSocket upgrade

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# WhatsApp Configuration
ENABLE_WA=true
SERVE_STATIC=true
```

## Proxy/WAF Configuration

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # WebSocket upgrade headers
    location /socket.io {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase timeouts for WebSocket
        proxy_read_timeout 75s;
        proxy_connect_timeout 20s;
        proxy_send_timeout 75s;

        # WebSocket specific
        proxy_buffering off;
        proxy_cache off;
    }

    # WhatsApp media endpoint - allow longer timeouts
    location /api/wa/media {
        proxy_pass http://localhost:8080;
        proxy_read_timeout 60s;
        proxy_connect_timeout 20s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Regular API endpoints
    location /api {
        proxy_pass http://localhost:8080;
        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend static files
    location / {
        proxy_pass http://localhost:8080;
    }
}
```

### Apache Configuration
```apache
<VirtualHost *:80>
    ServerName yourdomain.com

    # Enable WebSocket proxy
    ProxyPass /socket.io http://localhost:8080/socket.io
    ProxyPassReverse /socket.io http://localhost:8080/socket.io

    # WebSocket headers
    <Location /socket.io>
        Header set Connection upgrade
        Header set Upgrade websocket
        ProxyPreserveHost On
        ProxyTimeout 75
    </Location>

    # WhatsApp media with longer timeout
    <Location /api/wa/media>
        ProxyPass http://localhost:8080/api/wa/media
        ProxyPassReverse http://localhost:8080/api/wa/media
        ProxyTimeout 60
    </Location>

    # Regular API
    <Location /api>
        ProxyPass http://localhost:8080/api
        ProxyPassReverse http://localhost:8080/api
        ProxyTimeout 30
    </Location>

    # Frontend
    ProxyPass / http://localhost:8080/
    ProxyPassReverse / http://localhost:8080/
</VirtualHost>
```

## Cloudflare WAF Rules

### Allow WebSocket Upgrades
```
Field: HTTP Header
Name: Connection
Value: upgrade
Action: Allow
```

### Allow Socket.IO Polling
```
Field: URI Path
Value: /socket.io
Action: Allow
```

### Increase Timeout for WhatsApp Media
```
Field: URI Path
Value: /api/wa/media
Action: Set timeout to 60 seconds
```

## Monitoring and Debugging

### Check WebSocket Health
```bash
curl http://yourdomain.com/api/health
```

Expected response:
```json
{
  "name": "BuySial Commerce API",
  "status": "ok",
  "db": {
    "state": 1,
    "label": "connected"
  },
  "websocket": {
    "connected": 2,
    "transports": ["websocket", "polling"],
    "status": "ok"
  },
  "timestamp": "2025-01-20T10:30:00.000Z"
}
```

### Browser Developer Tools
1. Open Developer Tools (F12)
2. Go to Network tab
3. Filter by "WS" (WebSocket)
4. Look for connection failures and check headers

### Common Issues and Solutions

#### Issue: WebSocket Connection Failed
**Symptoms**: `WebSocket connection to 'ws://yourdomain.com/socket.io/?...' failed`
**Solution**: Check proxy configuration for WebSocket upgrade headers

#### Issue: Frequent Disconnections
**Symptoms**: Socket disconnects every 30 seconds
**Solution**: Increase `pingTimeout` to 60+ seconds

#### Issue: 429/503 Errors on Media
**Symptoms**: Media fails to load with rate limit errors
**Solution**: Check `/api/wa/media` timeout settings and rate limiting

#### Issue: Polling Fallback Not Working
**Symptoms**: App works but no real-time updates
**Solution**: Ensure `/socket.io` path is not blocked by WAF

## Testing WebSocket Connection

### JavaScript Test
```javascript
const socket = io('https://yourdomain.com', {
  transports: ['websocket', 'polling'],
  timeout: 20000
});

socket.on('connect', () => console.log('Connected!'));
socket.on('disconnect', (reason) => console.log('Disconnected:', reason));
socket.on('connect_error', (error) => console.error('Connection error:', error));
```

### Manual Test
1. Open browser to your app
2. Open Developer Tools → Console
3. Check for socket connection logs
4. Verify real-time message updates work

## Deployment Checklist

- [ ] Environment variables set for Socket.IO timeouts
- [ ] Proxy configured for WebSocket upgrades
- [ ] WAF rules updated to allow Socket.IO
- [ ] Health endpoint accessible
- [ ] Real-time features tested
- [ ] Timeout settings appropriate for your network
