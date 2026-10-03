// Test fixtures only; no live provider credentials or network requests.
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('https://api.themoviedb.org/3/')) {
    if (options.headers.Authorization !== 'Bearer fixture-tmdb') throw Error('Missing server token');
    return Response.json({results: [{id: 11, title: 'Fixture movie', name: 'Fixture show', adult: false}]});
  }
  if (String(url) === 'https://api.groq.com/openai/v1/chat/completions') {
    if (options.headers.Authorization !== 'Bearer fixture-groq') throw Error('Missing server key');
    const body = JSON.parse(options.body);
    if (body.messages.length !== 1 || body.messages[0].role !== 'user' || body.stream !== false || body.max_completion_tokens !== 2048)
      throw Error('Unexpected single-prompt request');
    if (body.model !== (process.env.GROQ_MODEL || 'openai/gpt-oss-20b')) throw Error('Unexpected model');
    if (body.messages[0].content === 'provider-error')
      return Response.json({error: {message: 'Sensitive provider detail fixture-groq'}}, {status: 401});
    if (body.messages[0].content === 'provider-throws') throw Error('Sensitive exception fixture-groq');
    if (body.messages[0].content === 'provider-invalid-json') return new Response('invalid');
    if (body.messages[0].content === 'empty-reply') return Response.json({choices: []});
    if (body.messages[0].content === 'echo-key') return Response.json({choices: [{message: {content: 'fixture-groq'}}]});
    return Response.json({choices: [{message: {content: 'Fixture reply <script>window.injected=1</script>', reasoning: 'Not a public reply'}}]});
  }
  throw Error('Unexpected provider request');
};
