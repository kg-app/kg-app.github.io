/**
 * Live Server middleware — fixes app.html/ and app.html/<uuid> URLs.
 * Static servers treat "file.html/" as a directory and return 500.
 */
const SHARE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = function (req, res, next) {
  const [path, query = ''] = req.url.split('?');
  const m = path.match(/^(.*\.html)\/([^/]*)\/?$/i);
  if (!m) return next();
  const base = m[1], rest = (m[2] || '').replace(/\/$/, '');
  if (rest && SHARE_RE.test(rest)) {
    const p = new URLSearchParams(query); p.set('share', rest);
    res.writeHead(301, { Location: base + '?' + p.toString() });
  } else {
    res.writeHead(301, { Location: base + (query ? '?' + query : '') });
  }
  res.end();
};
