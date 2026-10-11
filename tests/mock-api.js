// Local-only fixture for manual browser QA. No real credentials or remote API.
import {createServer} from 'node:http';
import {canonical} from '../src/card.js';
const card={v:1,id:'a1b2c3d4',title:'鯨幣測試卡',vendor:'deepseek',model:'test-model',models:['*'],provider:'本機測試',proto:'openai',base:'http://127.0.0.1:18091/v1',key:'fake-local-test',iat:1760000000,balance_usd:'5.00'};
const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type,authorization,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access,x-goog-api-key');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(req.url==='/card'){res.setHeader('Content-Type','application/json');return res.end(canonical(card));}
  if(req.url.includes('/models')&&!req.url.includes(':stream')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({data:[{id:'test-model'},{id:'other-model'}]}));}
  if(req.url.includes('subscription')){res.setHeader('Content-Type','application/json');return res.end('{"hard_limit_usd":10,"access_until":1893456000}');}
  if(req.url.includes('/usage')){res.setHeader('Content-Type','application/json');return res.end('{"total_usage":71}');}
  if(req.method==='POST'){
    let raw='';for await(const p of req)raw+=p;const body=JSON.parse(raw),title=JSON.stringify(body).includes('只回覆標題');
    res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.flushHeaders();
    const say=o=>res.write('data: '+JSON.stringify(o)+'\n\n');
    if(title){say({choices:[{delta:{content:'鯨幣網頁測試'}}]});res.end('data: [DONE]\n\n');return;}
    say({choices:[{delta:{reasoning_content:'先想想怎麼回答…'}}]});
    const chunks=['你好！','這是 **鯨幣網頁版** 的串流回覆。\n\n','```js\nconsole.log("hello");\n```\n\n','|功能|狀態|\n|---|---|\n|聊天|可以使用|\n\n','你的對話會保存在瀏覽器。'];
    let i=0;const timer=setInterval(()=>{if(i<chunks.length)say({choices:[{delta:{content:chunks[i++]}}]});else{say({usage:{prompt_tokens:12,completion_tokens:40},choices:[]});res.end('data: [DONE]\n\n');clearInterval(timer);}},200);
    res.on('close',()=>clearInterval(timer));return;
  }
  res.writeHead(404);res.end('not found');
});server.listen(18091,'127.0.0.1',()=>console.log('Local test API http://127.0.0.1:18091; fake card /card'));
