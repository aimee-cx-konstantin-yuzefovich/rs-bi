// Node is already in every runtime image; no wget/curl dependency.
const http = require('node:http');
const timer = setTimeout(() => process.exit(1), 5000);
const request = http.get('http://127.0.0.1:3000/api/health', (response) => {
  response.resume();
  response.on('end', () => {
    clearTimeout(timer);
    process.exit(response.statusCode === 200 ? 0 : 1);
  });
});
request.on('error', () => process.exit(1));
