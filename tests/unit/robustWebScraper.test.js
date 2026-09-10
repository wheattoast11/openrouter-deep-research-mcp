const {test}=require('node:test');
const assert=require('node:assert/strict');
const Mesh=require('../../src/utils/robustWebScraper');
test('mesh uses injected transport, unwraps source URLs and retains observed dates',async()=>{
 const calls=[];
 const mesh=new Mesh({transport:{post:async(url,body)=>{calls.push({url,body});return {data:'<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.test%2Fpage">Source</a><span class="result__snippet">Snippet</span>'}},get:async(url)=>({data:'<title>Article</title><meta property="article:published_time" content="2020-01-01T00:00:00Z"><main>Evidence<script>untrusted script</script></main>',finalUrl:url})}});
 const rows=await mesh.searchDuckDuckGoHtml('public query');
 assert.equal(rows[0].url,'https://example.test/page');
 assert.equal(calls[0].body,'q=public+query');
 const page=await mesh.fetchSignal(rows[0].url);
 assert.equal(page.type,'response');
 assert.equal(page.payload.content,'Evidence');
 assert.equal(page.payload.publishedAt,'2020-01-01T00:00:00.000Z');
 assert.ok(Date.now()-Date.parse(page.payload.retrievedAt)<5000);
});
test('failed fetch stays an error without invented source content',async()=>{
 const mesh=new Mesh({transport:{get:async()=>{throw Error('unavailable')}}});
 assert.equal((await mesh.fetchSignal('https://example.test')).type,'error');
});
