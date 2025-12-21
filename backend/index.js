const http = require('http');

const PORT = process.env.PORT || 4000;

const handler = (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Backend placeholder running' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'nest-backend', path: req.url, method: req.method }));
};

http.createServer(handler).listen(PORT, () => {
  console.log(`Backend service listening on port ${PORT}`);
});
