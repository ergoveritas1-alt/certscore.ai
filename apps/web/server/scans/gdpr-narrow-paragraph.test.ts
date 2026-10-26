import assert from 'node:assert/strict';
import test from 'node:test';
import {retainedParagraphHtmlMatchesText as matches} from './gdpr-narrow-paragraph';
const text='We use cookies for advertising. By continuing to browse, you agree to our use of cookies.';
test('complete paragraph HTML agrees with exact retained text, including empty decorative hidden nodes',()=>{
 assert.equal(matches(`<div><span aria-hidden="true"></span>${text}</div>`,text),true);
 assert.equal(matches('<div>A &amp; B&nbsp;&#65;</div>','A & B A'),true);
});
for(const [name,html] of [
 ['missing',undefined],['truncated',`<div>${text}`],['different text',`<div>Other words</div>`],
 ['hidden prose',`<div><span hidden>${text}</span></div>`],
 ['aria-hidden prose',`<div><span aria-hidden="true">${text}</span></div>`],
 ['inline concealed prose',`<div><span style="display:none">${text}</span></div>`],
 ['zero font',`<div><span style="font-size:0">${text}</span></div>`],
 ['transparent font',`<div><span style="color:transparent">${text}</span></div>`],
 ['clipped prose',`<div><span style="clip-path:inset(100%)">${text}</span></div>`],
 ['class concealed prose',`<div><span class="sr-only">${text}</span></div>`],
 ['script',`<div><script>${text}</script></div>`],['template',`<div><template>${text}</template></div>`],
 ['inert',`<div inert>${text}</div>`],['mismatched tags',`<div><span>${text}</div></span>`],
 ['duplicate attrs',`<div hidden="" hidden="false">${text}</div>`],['multiple roots',`<div>${text}</div><span></span>`],
] as const)test(`HTML proof rejects ${name}`,()=>assert.equal(matches(html,text),false));
