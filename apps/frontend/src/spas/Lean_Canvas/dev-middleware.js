/**
 * Live Server middleware: fix LeanCanvas.html/ and LeanCanvas.html/<uuid> URLs
 * (static servers treat "file.html/" as a directory and return 500).
 */
const SHARE_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function redirectForHtmlPath(path, query) {
  const m = path.match(/^(.*\.html)\/([^/]*)\/?$/i);
  if (!m) return null;
  const base = m[1];
  const rest = (m[2] || '').replace(/\/$/, '');
  const qs = query ? '?' + query : '';
  if (rest && SHARE_PATH_RE.test(rest)) {
    const params = new URLSearchParams(query);
    params.set('share', rest);
    return base + '?' + params.toString();
  }
  return base + qs;
}

module.exports = function devMiddleware(req, res, next) {
  const [path, query = ''] = req.url.split('?');
  const target = redirectForHtmlPath(path, query);
  if (target) {
    res.writeHead(301, { Location: target });
    res.end();
    return;
  }
  next();
};
