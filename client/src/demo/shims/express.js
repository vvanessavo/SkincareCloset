// Just enough of Express to run the server's routers in the browser: method and
// path matching, router.param and middleware. Responses are plain objects.

function compile(path) {
  const names = [];
  const pattern = path
    .split('/')
    .map((part) => {
      if (!part.startsWith(':')) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(part.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { regex: new RegExp(`^${pattern === '' ? '/' : pattern}$`), names };
}

export function Router() {
  const routes = [];
  const paramHandlers = {};

  function add(method) {
    return (path, ...handlers) => {
      routes.push({ method, ...compile(path), handlers });
      return router;
    };
  }

  const router = {
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    delete: add('DELETE'),
    param(name, handler) {
      paramHandlers[name] = handler;
      return router;
    },

    // Resolves true if a route handled the request.
    async handle(req, res, path) {
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = route.regex.exec(path);
        if (!match) continue;

        req.params = Object.fromEntries(
          route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])]),
        );
        const chain = [
          ...route.names
            .filter((name) => paramHandlers[name])
            .map((name) => (rq, rs, next) => paramHandlers[name](rq, rs, next, rq.params[name])),
          ...route.handlers,
        ];
        await run(chain, req, res);
        return true;
      }
      return false;
    },
  };

  return router;
}

async function run(chain, req, res) {
  for (const handler of chain) {
    let advanced = false;
    await handler(req, res, () => {
      advanced = true;
    });
    if (!advanced || res.finished) return;
  }
}

// Bodies are parsed by the demo transport before they reach a router.
function passThrough() {
  return (req, res, next) => next();
}

export default { Router, json: passThrough, raw: passThrough, static: passThrough };
