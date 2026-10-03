// Test fixtures only; no live provider credentials or network requests.
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('https://api.themoviedb.org/3/')) {
    if (options.headers.Authorization !== 'Bearer fixture-tmdb') throw Error('Missing server token');
    return Response.json({results: [{id: 11, title: 'Fixture movie', name: 'Fixture show', adult: false}]});
  }
  if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
    if (options.headers['x-goog-api-key'] !== 'fixture-gemini') throw Error('Missing server key');
    return Response.json({candidates: [{content: {parts: [{text: 'Fixture reply'}]}}]});
  }
  throw Error('Unexpected provider request');
};
