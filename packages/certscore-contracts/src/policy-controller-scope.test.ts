import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLocalizedPolicyControllerScope} from './policy-controller-scope';
import {classifyPrivacySurface} from './privacy-surface-classifier';

test('combined privacy and terms labels preserve their canonical combined variant in either order',()=>{
 for(const linkText of ['Privacy & Terms','Terms & Privacy','Terms and Privacy','Terms / Privacy']){
  const c=classifyPrivacySurface({linkText,url:'https://example.test/terms'});
  assert.equal(c.surfaceType,'privacy_policy');assert.equal(c.variant,'combined_privacy_terms_surface');
 }
 assert.equal(classifyPrivacySurface({linkText:'Terms of service'}).surfaceType,'terms');
});
test('Chinese scope requires the exact domain in a retained positive operator/privacy clause',()=>{
 const input={targetUrl:'https://example.cn/',text:'隐私政策。相关服务系指示例有限公司合法拥有并运营的客户端、example.cn网站以及浏览器插件。我们保护个人信息。'};
 assert.equal(classifyLocalizedPolicyControllerScope(input)?.locale,'zh');
 assert.equal(classifyLocalizedPolicyControllerScope(input)?.ownerEntity,'示例有限公司');
 for(const text of ['隐私政策。我们的供应商包括 example.cn。','隐私政策。示例有限公司合法拥有并运营的notexample.cn网站。',
  '隐私政策。示例有限公司合法拥有并运营的example.cn.evil.test网站。','隐私政策。示例有限公司并非拥有并运营example.cn网站。'])
  assert.equal(classifyLocalizedPolicyControllerScope({...input,text}),null,text);
});
