interface PagesContext {
  request: Request;
  next: (request?: Request) => Promise<Response>;
}

const PRESENTATION_HOST = 'deck.ort-tech.co.il';

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);

  if (url.hostname === PRESENTATION_HOST && url.pathname === '/') {
    url.pathname = '/presentation/';
    return Response.redirect(url.toString(), 302);
  }

  return context.next();
}
