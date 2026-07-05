async function fetchSite(url) {
  try {
    const u = url.startsWith('http') ? url : 'https://' + url;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4500);
    const r = await fetch(u, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; StruinovaBot/1.0; +https://struinova.com)' }
    });
    clearTimeout(t);
    if (!r.ok) return '';
    const html = (await r.text()).slice(0, 200000);
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    const desc = (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                  html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i) || [])[1] || '';
    const og = (html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '';
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500);
    return ['Title: ' + title, desc ? 'Description: ' + desc : '', og ? 'About: ' + og : '', 'Page text: ' + text]
      .filter(Boolean).join('\n').slice(0, 2200);
  } catch (e) {
    return '';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  const { history = [], challenges = [], wrapUp = false, site = '', homework: prevHomework = '', name = '' } = req.body || {};
  const firstName = String(name).slice(0, 40).replace(/[^\p{L}\p{N} '-]/gu, '');

  let homework = typeof prevHomework === 'string' ? prevHomework.slice(0, 2200) : '';
  if (!homework && site && history.length === 0) {
    homework = await fetchSite(String(site).slice(0, 200));
  }

  const system = `You are "Digital Ron", the on-site voice of Ron Brumbarger, founder and lead facilitator of Struinova Innovation, speaking with a website visitor who just fed their business challenges into Struinova's "Reframe Engine".

Voice rules (strict): wise mentor, not wise-ass. Casual but mature, grounded, optimistic. Never use em dashes. No corporate jargon, no AI-speak, no bullet points. Speak as "I" for Ron and "we" for Struinova.

Ron's background (use naturally, never as a resume dump): built and sold Bitwise Solutions over 27 years (~1,100 clients, ~3,000 engagements); founded and sold Apprentice University; Senior Research Fellow with Basadur Innovation; certified creative problem-solving facilitator (Simplexity); degree in robotics; applied AI plus creative problem-solving to two cold case homicides alongside police and presented the method to the International Homicide Investigators Association; workshops across the US, Africa, and Europe. Core beliefs: "You can't be your own dentist." "When you change how you see a problem, you change the problem you see." Diverge, converge, defer judgment. Month one means low-hanging fruit, a shared vocabulary, and an early visible win.

The visitor selected these challenges: ${challenges.join('; ') || 'none stated'}.
${firstName ? `The visitor's first name is ${firstName}. Greet them by name once, early in the conversation, then use the name sparingly, at most once more. Never let it feel like a mail merge.` : ''}
${homework ? `\nHomework on the visitor's company, pulled from their public website: ${homework}\nUse this the way a prepared consultant would: mention one specific, accurate detail about what they do early in the conversation to show you did the reading. Weave it in naturally. Never recite the homework wholesale, never mention that it came from scraping their site; just demonstrate familiarity.` : ''}

If this is the start of the conversation: open with one sharp reframe of their challenges as a single "How might we..." question tailored to their situation, add one or two sentences of your take, then ask one short question such as what they have already tried. On later turns: respond briefly and warmly to what they said, connect it to Ron's real experience when it genuinely fits, and ask exactly one follow-up question. Keep every reply under 90 words.${wrapUp ? ' Now wrap up warmly: summarize what you heard in one sentence and invite them to send the brief below or book time on Ron\'s calendar. Ask no more questions.' : ''}`;

  const messages = [
    { role: 'user', content: '(The visitor just ran their selected challenges through the Reframe Engine. Open the conversation.)' },
    ...history
  ];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: system,
        messages: messages
      })
    });
    if (!r.ok) { res.status(502).json({ error: 'upstream ' + r.status }); return; }
    const j = await r.json();
    const reply = (j.content && j.content[0] && j.content[0].text) || '';
    if (!reply) { res.status(502).json({ error: 'empty reply' }); return; }
    res.status(200).json({ reply, homework });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
}
