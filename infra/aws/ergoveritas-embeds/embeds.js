(() => {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const count = ({'/':1,'/legal':2,'/privacy':3,'/terms':1})[path] || 0;
  if (!count || document.getElementById('ergoveritas-test-embeds')) return;
  const section = document.createElement('section');
  section.id = 'ergoveritas-test-embeds';
  section.setAttribute('aria-label', 'Embedded test content');
  section.style.cssText = 'max-width:1100px;margin:32px auto;padding:24px;border:1px solid #dce5ed;border-radius:16px';
  const title = document.createElement('h2'); title.textContent = 'Embedded test content'; section.append(title);
  const note = document.createElement('p'); note.textContent = 'These same-site frames support scanner testing. They contain no third-party tracking.'; section.append(note);
  ['card','chart','notice'].slice(0,count).forEach((name,index) => {
    const frame = document.createElement('iframe');
    frame.src = '/.well-known/certscore-embeds/' + name + '.html';
    frame.title = 'ErgoVeritas test embed ' + (index + 1) + ': ' + name;
    frame.style.cssText = 'display:block;width:100%;height:190px;border:0;border-radius:12px;margin-top:12px';
    section.append(frame);
  });
  (document.querySelector('main') || document.body).append(section);
})();
