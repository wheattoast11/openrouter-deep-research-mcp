"use strict";var J=Object.defineProperty;var me=Object.getOwnPropertyDescriptor;var ye=Object.getOwnPropertyNames;var he=Object.prototype.hasOwnProperty;var re=e=>{throw TypeError(e)};var ge=(e,t)=>{for(var n in t)J(e,n,{get:t[n],enumerable:!0})},be=(e,t,n,s)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of ye(t))!he.call(e,r)&&r!==n&&J(e,r,{get:()=>t[r],enumerable:!(s=me(t,r))||s.enumerable});return e};var _e=e=>be(J({},"__esModule",{value:!0}),e);var Y=(e,t,n)=>t.has(e)||re("Cannot "+n);var l=(e,t,n)=>(Y(e,t,"read from private field"),n?n.call(e):t.get(e)),B=(e,t,n)=>t.has(e)?re("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,n),C=(e,t,n,s)=>(Y(e,t,"write to private field"),s?s.call(e,n):t.set(e,n),n),L=(e,t,n)=>(Y(e,t,"access private method"),n);var K=(e,t,n,s)=>({set _(r){C(e,t,r,n)},get _(){return l(e,t,s)}});var ct={};ge(ct,{live:()=>ut});module.exports=_e(ct);function U(e){let t=e.length;for(let n=e.length-1;n>=0;n--){let s=e.charCodeAt(n);s>127&&s<=2047?t++:s>2047&&s<=65535&&(t+=2),s>=56320&&s<=57343&&n--}return t}var _,E,k,j,V,T,W,F,se,P=class{constructor(t=256){this.size=t;B(this,T);B(this,_);B(this,E,5);B(this,k,!1);B(this,j,new TextEncoder);B(this,V,0);C(this,_,L(this,T,W).call(this,t))}addInt32(t){return L(this,T,F).call(this,4),l(this,_).setInt32(l(this,E),t,l(this,k)),C(this,E,l(this,E)+4),this}addInt16(t){return L(this,T,F).call(this,2),l(this,_).setInt16(l(this,E),t,l(this,k)),C(this,E,l(this,E)+2),this}addCString(t){return t&&this.addString(t),L(this,T,F).call(this,1),l(this,_).setUint8(l(this,E),0),K(this,E)._++,this}addString(t=""){let n=U(t);return L(this,T,F).call(this,n),l(this,j).encodeInto(t,new Uint8Array(l(this,_).buffer,l(this,E))),C(this,E,l(this,E)+n),this}add(t){return L(this,T,F).call(this,t.byteLength),new Uint8Array(l(this,_).buffer).set(new Uint8Array(t),l(this,E)),C(this,E,l(this,E)+t.byteLength),this}flush(t){let n=L(this,T,se).call(this,t);return C(this,E,5),C(this,_,L(this,T,W).call(this,this.size)),new Uint8Array(n)}};_=new WeakMap,E=new WeakMap,k=new WeakMap,j=new WeakMap,V=new WeakMap,T=new WeakSet,W=function(t){return new DataView(new ArrayBuffer(t))},F=function(t){if(l(this,_).byteLength-l(this,E)<t){let s=l(this,_).buffer,r=s.byteLength+(s.byteLength>>1)+t;C(this,_,L(this,T,W).call(this,r)),new Uint8Array(l(this,_).buffer).set(new Uint8Array(s))}},se=function(t){if(t){l(this,_).setUint8(l(this,V),t);let n=l(this,E)-(l(this,V)+1);l(this,_).setInt32(l(this,V)+1,n,l(this,k))}return l(this,_).buffer.slice(t?0:5,l(this,E))};var g=new P,Ee=e=>{g.addInt16(3).addInt16(0);for(let s of Object.keys(e))g.addCString(s).addCString(e[s]);g.addCString("client_encoding").addCString("UTF8");let t=g.addCString("").flush(),n=t.byteLength+4;return new P().addInt32(n).add(t).flush()},we=()=>{let e=new DataView(new ArrayBuffer(8));return e.setInt32(0,8,!1),e.setInt32(4,80877103,!1),new Uint8Array(e.buffer)},Ae=e=>g.addCString(e).flush(112),Te=(e,t)=>(g.addCString(e).addInt32(U(t)).addString(t),g.flush(112)),Re=e=>g.addString(e).flush(112),Se=e=>g.addCString(e).flush(81),Ie=[],Ce=e=>{let t=e.name??"";t.length>63&&(console.error("Warning! Postgres only supports 63 characters for query names."),console.error("You supplied %s (%s)",t,t.length),console.error("This can cause conflicts and silent errors executing queries"));let n=g.addCString(t).addCString(e.text).addInt16(e.types?.length??0);return e.types?.forEach(s=>n.addInt32(s)),g.flush(80)},G=new P;var Ne=(e,t)=>{for(let n=0;n<e.length;n++){let s=t?t(e[n],n):e[n];if(s===null)g.addInt16(0),G.addInt32(-1);else if(s instanceof ArrayBuffer||ArrayBuffer.isView(s)){let r=ArrayBuffer.isView(s)?s.buffer.slice(s.byteOffset,s.byteOffset+s.byteLength):s;g.addInt16(1),G.addInt32(r.byteLength),G.add(r)}else g.addInt16(0),G.addInt32(U(s)),G.addString(s)}},Le=(e={})=>{let t=e.portal??"",n=e.statement??"",s=e.binary??!1,r=e.values??Ie,c=r.length;return g.addCString(t).addCString(n),g.addInt16(c),Ne(r,e.valueMapper),g.addInt16(c),g.add(G.flush()),g.addInt16(s?1:0),g.flush(66)},ve=new Uint8Array([69,0,0,0,9,0,0,0,0,0]),De=e=>{if(!e||!e.portal&&!e.rows)return ve;let t=e.portal??"",n=e.rows??0,s=U(t),r=4+s+1+4,c=new DataView(new ArrayBuffer(1+r));return c.setUint8(0,69),c.setInt32(1,r,!1),new TextEncoder().encodeInto(t,new Uint8Array(c.buffer,5)),c.setUint8(s+5,0),c.setUint32(c.byteLength-4,n,!1),new Uint8Array(c.buffer)},Oe=(e,t)=>{let n=new DataView(new ArrayBuffer(16));return n.setInt32(0,16,!1),n.setInt16(4,1234,!1),n.setInt16(6,5678,!1),n.setInt32(8,e,!1),n.setInt32(12,t,!1),new Uint8Array(n.buffer)},Z=(e,t)=>{let n=new P;return n.addCString(t),n.flush(e)},Me=g.addCString("P").flush(68),xe=g.addCString("S").flush(68),Be=e=>e.name?Z(68,`${e.type}${e.name??""}`):e.type==="P"?Me:xe,Pe=e=>{let t=`${e.type}${e.name??""}`;return Z(67,t)},$e=e=>g.add(e).flush(100),Ue=e=>Z(102,e),Q=e=>new Uint8Array([e,0,0,0,4]),Fe=Q(72),ke=Q(83),Ve=Q(88),Ge=Q(99),q={startup:Ee,password:Ae,requestSsl:we,sendSASLInitialResponseMessage:Te,sendSCRAMClientFinalMessage:Re,query:Se,parse:Ce,bind:Le,execute:De,describe:Be,close:Pe,flush:()=>Fe,sync:()=>ke,end:()=>Ve,copyData:$e,copyDone:()=>Ge,copyFail:Ue,cancel:Oe};var St=new ArrayBuffer(0);var We=1,je=4,pn=We+je,fn=new ArrayBuffer(0);var Qe=globalThis.JSON.parse,He=globalThis.JSON.stringify,ie=16,ae=17;var oe=20,ze=21,Xe=23;var H=25,Je=26;var ue=114;var Ye=700,Ke=701;var Ze=1042,et=1043,tt=1082;var nt=1114,le=1184;var rt=3802;var st={string:{to:H,from:[H,et,Ze],serialize:e=>{if(typeof e=="string")return e;if(typeof e=="number")return e.toString();throw new Error("Invalid input for string type")},parse:e=>e},number:{to:0,from:[ze,Xe,Je,Ye,Ke],serialize:e=>e.toString(),parse:e=>+e},bigint:{to:oe,from:[oe],serialize:e=>e.toString(),parse:e=>{let t=BigInt(e);return t<Number.MIN_SAFE_INTEGER||t>Number.MAX_SAFE_INTEGER?t:Number(t)}},json:{to:ue,from:[ue,rt],serialize:e=>typeof e=="string"?e:He(e),parse:e=>Qe(e)},boolean:{to:ie,from:[ie],serialize:e=>{if(typeof e!="boolean")throw new Error("Invalid input for boolean type");return e?"t":"f"},parse:e=>e==="t"},date:{to:le,from:[tt,nt,le],serialize:e=>{if(typeof e=="string")return e;if(typeof e=="number")return new Date(e).toISOString();if(e instanceof Date)return e.toISOString();throw new Error("Invalid input for date type")},parse:e=>new Date(e)},bytea:{to:ae,from:[ae],serialize:e=>{if(!(e instanceof Uint8Array))throw new Error("Invalid input for bytea type");return"\\x"+Array.from(e).map(t=>t.toString(16).padStart(2,"0")).join("")},parse:e=>{let t=e.slice(2);return Uint8Array.from({length:t.length/2},(n,s)=>parseInt(t.substring(s*2,(s+1)*2),16))}}},ce=it(st),An=ce.parsers,Tn=ce.serializers;function it(e){return Object.keys(e).reduce(({parsers:t,serializers:n},s)=>{let{to:r,from:c,serialize:i,parse:h}=e[s];return n[r]=i,n[s]=i,t[s]=h,Array.isArray(c)?c.forEach(m=>{t[m]=h,n[m]=i}):(t[c]=h,n[c]=i),{parsers:t,serializers:n}},{parsers:{},serializers:{}})}function de(e){let t=e.find(n=>n.name==="parameterDescription");return t?t.dataTypeIDs:[]}var Mn=typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string";var ee=()=>{if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();let e=new Uint8Array(16);if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(e);else for(let n=0;n<e.length;n++)e[n]=Math.floor(Math.random()*256);e[6]=e[6]&15|64,e[8]=e[8]&63|128;let t=[];return e.forEach(n=>{t.push(n.toString(16).padStart(2,"0"))}),t.slice(0,4).join("")+"-"+t.slice(4,6).join("")+"-"+t.slice(6,8).join("")+"-"+t.slice(8,10).join("")+"-"+t.slice(10).join("")};async function te(e,t,n,s){if(!n||n.length===0)return t;s=s??e;let r;try{await e.execProtocol(q.parse({text:t}),{syncToFs:!1}),r=de((await e.execProtocol(q.describe({type:"S"}),{syncToFs:!1})).messages)}finally{await e.execProtocol(q.sync(),{syncToFs:!1})}let c=t.replace(/\$([0-9]+)/g,(h,m)=>"%"+m+"L");return(await s.query(`SELECT format($1, ${n.map((h,m)=>`$${m+2}`).join(", ")}) as query`,[c,...n],{paramTypes:[H,...r]})).rows[0].query}function ne(e){let t,n=!1,s=async()=>{if(!t){n=!1;return}n=!0;let{args:r,resolve:c,reject:i}=t;t=void 0;try{let h=await e(...r);c(h)}catch(h){i(h)}finally{s()}};return async(...r)=>{t&&t.resolve(void 0);let c=new Promise((i,h)=>{t={args:r,resolve:i,reject:h}});return n||s(),c}}var at=5,ot=async(e,t)=>{let n=new Set,s={async query(r,c,i){let h,m,p;if(typeof r!="string"&&(h=r.signal,c=r.params,i=r.callback,m=r.offset,p=r.limit,r=r.query),m===void 0!=(p===void 0))throw new Error("offset and limit must be provided together");let o=m!==void 0&&p!==void 0,A;if(o&&(typeof m!="number"||isNaN(m)||typeof p!="number"||isNaN(p)))throw new Error("offset and limit must be numbers");let w=i?[i]:[],f=ee().replace(/-/g,""),R=!1,S,O,$=async()=>{await e.transaction(async a=>{let d=c&&c.length>0?await te(e,r,c,a):r;await a.exec(`CREATE OR REPLACE TEMP VIEW live_query_${f}_view AS ${d}`),O=await pe(a,`live_query_${f}_view`),await fe(a,O,n),o?(await a.exec(`
              PREPARE live_query_${f}_get(int, int) AS
              SELECT * FROM live_query_${f}_view
              LIMIT $1 OFFSET $2;
            `),await a.exec(`
              PREPARE live_query_${f}_get_total_count AS
              SELECT COUNT(*) FROM live_query_${f}_view;
            `),A=(await a.query(`EXECUTE live_query_${f}_get_total_count;`)).rows[0].count,S={...await a.query(`EXECUTE live_query_${f}_get(${p}, ${m});`),offset:m,limit:p,totalCount:A}):(await a.exec(`
              PREPARE live_query_${f}_get AS
              SELECT * FROM live_query_${f}_view;
            `),S=await a.query(`EXECUTE live_query_${f}_get;`))})};await $();let M=ne(async({offset:a,limit:d}={})=>{if(!o&&(a!==void 0||d!==void 0))throw new Error("offset and limit cannot be provided for non-windowed queries");if(a&&(typeof a!="number"||isNaN(a))||d&&(typeof d!="number"||isNaN(d)))throw new Error("offset and limit must be numbers");m=a??m,p=d??p;let I=async(b=0)=>{if(w.length!==0){try{o?S={...await e.query(`EXECUTE live_query_${f}_get(${p}, ${m});`),offset:m,limit:p,totalCount:A}:S=await e.query(`EXECUTE live_query_${f}_get;`)}catch(u){let D=u.message;if(D.startsWith(`prepared statement "live_query_${f}`)&&D.endsWith("does not exist")){if(b>at)throw u;await $(),I(b+1)}else throw u}if(z(w,S),o){let u=(await e.query(`EXECUTE live_query_${f}_get_total_count;`)).rows[0].count;u!==A&&(A=u,M())}}};await I()}),N=await Promise.all(O.map(a=>e.listen(`table_change__${a.schema_name}__${a.table_name}`,async()=>{M()}))),x=a=>{if(R)throw new Error("Live query is no longer active and cannot be subscribed to");w.push(a)},y=async a=>{a?w=w.filter(d=>d!==d):w=[],w.length===0&&(R=!0,await Promise.all(N.map(d=>d())),await e.exec(`
            DROP VIEW IF EXISTS live_query_${f}_view;
            DEALLOCATE live_query_${f}_get;
          `))};return h?.aborted?await y():h?.addEventListener("abort",()=>{y()},{once:!0}),z(w,S),{initialResults:S,subscribe:x,unsubscribe:y,refresh:M}},async changes(r,c,i,h){let m;if(typeof r!="string"&&(m=r.signal,c=r.params,i=r.key,h=r.callback,r=r.query),!i)throw new Error("key is required for changes queries");let p=h?[h]:[],o=ee().replace(/-/g,""),A=!1,w,f=1,R,S=async()=>{await e.transaction(async y=>{let a=await te(e,r,c,y);await y.query(`CREATE OR REPLACE TEMP VIEW live_query_${o}_view AS ${a}`),w=await pe(y,`live_query_${o}_view`),await fe(y,w,n);let d=[...(await y.query(`
                SELECT column_name, data_type, udt_name
                FROM information_schema.columns 
                WHERE table_name = 'live_query_${o}_view'
              `)).rows,{column_name:"__after__",data_type:"integer"}];await y.exec(`
            CREATE TEMP TABLE live_query_${o}_state1 (LIKE live_query_${o}_view INCLUDING ALL);
            CREATE TEMP TABLE live_query_${o}_state2 (LIKE live_query_${o}_view INCLUDING ALL);
          `);for(let I of[1,2]){let b=I===1?2:1;await y.exec(`
              PREPARE live_query_${o}_diff${I} AS
              WITH
                prev AS (SELECT LAG("${i}") OVER () as __after__, * FROM live_query_${o}_state${b}),
                curr AS (SELECT LAG("${i}") OVER () as __after__, * FROM live_query_${o}_state${I}),
                data_diff AS (
                  -- INSERT operations: Include all columns
                  SELECT 
                    'INSERT' AS __op__,
                    ${d.map(({column_name:u})=>`curr."${u}" AS "${u}"`).join(`,
`)},
                    ARRAY[]::text[] AS __changed_columns__
                  FROM curr
                  LEFT JOIN prev ON curr.${i} = prev.${i}
                  WHERE prev.${i} IS NULL
                UNION ALL
                  -- DELETE operations: Include only the primary key
                  SELECT 
                    'DELETE' AS __op__,
                    ${d.map(({column_name:u,data_type:D,udt_name:X})=>u===i?`prev."${u}" AS "${u}"`:`NULL${D==="USER-DEFINED"?`::${X}`:""} AS "${u}"`).join(`,
`)},
                      ARRAY[]::text[] AS __changed_columns__
                  FROM prev
                  LEFT JOIN curr ON prev.${i} = curr.${i}
                  WHERE curr.${i} IS NULL
                UNION ALL
                  -- UPDATE operations: Include only changed columns
                  SELECT 
                    'UPDATE' AS __op__,
                    ${d.map(({column_name:u,data_type:D,udt_name:X})=>u===i?`curr."${u}" AS "${u}"`:`CASE 
                              WHEN curr."${u}" IS DISTINCT FROM prev."${u}" 
                              THEN curr."${u}"
                              ELSE NULL${D==="USER-DEFINED"?`::${X}`:""}
                              END AS "${u}"`).join(`,
`)},
                      ARRAY(SELECT unnest FROM unnest(ARRAY[${d.filter(({column_name:u})=>u!==i).map(({column_name:u})=>`CASE
                              WHEN curr."${u}" IS DISTINCT FROM prev."${u}" 
                              THEN '${u}' 
                              ELSE NULL 
                              END`).join(", ")}]) WHERE unnest IS NOT NULL) AS __changed_columns__
                  FROM curr
                  INNER JOIN prev ON curr.${i} = prev.${i}
                  WHERE NOT (curr IS NOT DISTINCT FROM prev)
                )
              SELECT * FROM data_diff;
            `)}})};await S();let O=ne(async()=>{if(p.length===0&&R)return;let y=!1;for(let a=0;a<5;a++)try{await e.transaction(async d=>{await d.exec(`
                INSERT INTO live_query_${o}_state${f} 
                  SELECT * FROM live_query_${o}_view;
              `),R=await d.query(`EXECUTE live_query_${o}_diff${f};`),f=f===1?2:1,await d.exec(`
                TRUNCATE live_query_${o}_state${f};
              `)});break}catch(d){if(d.message===`relation "live_query_${o}_state${f}" does not exist`){y=!0,await S();continue}else throw d}lt(p,[...y?[{__op__:"RESET"}]:[],...R.rows])}),$=await Promise.all(w.map(y=>e.listen(`table_change__${y.schema_name}__${y.table_name}`,async()=>O()))),M=y=>{if(A)throw new Error("Live query is no longer active and cannot be subscribed to");p.push(y)},N=async y=>{y?p=p.filter(a=>a!==a):p=[],p.length===0&&(A=!0,await Promise.all($.map(a=>a())),await e.exec(`
            DROP VIEW IF EXISTS live_query_${o}_view;
            DROP TABLE IF EXISTS live_query_${o}_state1;
            DROP TABLE IF EXISTS live_query_${o}_state2;
            DEALLOCATE live_query_${o}_diff1;
            DEALLOCATE live_query_${o}_diff2;
          `))};return m?.aborted?await N():m?.addEventListener("abort",()=>{N()},{once:!0}),await O(),{fields:R.fields.filter(y=>!["__after__","__op__","__changed_columns__"].includes(y.name)),initialChanges:R.rows,subscribe:M,unsubscribe:N,refresh:O}},async incrementalQuery(r,c,i,h){let m;if(typeof r!="string"&&(m=r.signal,c=r.params,i=r.key,h=r.callback,r=r.query),!i)throw new Error("key is required for incremental queries");let p=h?[h]:[],o=new Map,A=new Map,w=[],f=!0,{fields:R,unsubscribe:S,refresh:O}=await s.changes(r,c,i,N=>{for(let a of N){let{__op__:d,__changed_columns__:I,...b}=a;switch(d){case"RESET":o.clear(),A.clear();break;case"INSERT":o.set(b[i],b),A.set(b.__after__,b[i]);break;case"DELETE":{let u=o.get(b[i]);o.delete(b[i]),u.__after__!==null&&A.delete(u.__after__);break}case"UPDATE":{let u={...o.get(b[i])??{}};for(let D of I)u[D]=b[D],D==="__after__"&&A.set(b.__after__,b[i]);o.set(b[i],u);break}}}let x=[],y=null;for(let a=0;a<o.size;a++){let d=A.get(y),I=o.get(d);if(!I)break;let b={...I};delete b.__after__,x.push(b),y=d}w=x,f||z(p,{rows:x,fields:R})});f=!1,z(p,{rows:w,fields:R});let $=N=>{p.push(N)},M=async N=>{N?p=p.filter(x=>x!==x):p=[],p.length===0&&await S()};return m?.aborted?await M():m?.addEventListener("abort",()=>{M()},{once:!0}),{initialResults:{rows:w,fields:R},subscribe:$,unsubscribe:M,refresh:O}}};return{namespaceObj:s}},ut={name:"Live Queries",setup:ot};async function pe(e,t){return(await e.query(`
      WITH RECURSIVE view_dependencies AS (
        -- Base case: Get the initial view's dependencies
        SELECT DISTINCT
          cl.relname AS dependent_name,
          n.nspname AS schema_name,
          cl.relkind = 'v' AS is_view
        FROM pg_rewrite r
        JOIN pg_depend d ON r.oid = d.objid
        JOIN pg_class cl ON d.refobjid = cl.oid
        JOIN pg_namespace n ON cl.relnamespace = n.oid
        WHERE
          r.ev_class = (
              SELECT oid FROM pg_class WHERE relname = $1 AND relkind = 'v'
          )
          AND d.deptype = 'n'

        UNION ALL

        -- Recursive case: Traverse dependencies for views
        SELECT DISTINCT
          cl.relname AS dependent_name,
          n.nspname AS schema_name,
          cl.relkind = 'v' AS is_view
        FROM view_dependencies vd
        JOIN pg_rewrite r ON vd.dependent_name = (
          SELECT relname FROM pg_class WHERE oid = r.ev_class AND relkind = 'v'
        )
        JOIN pg_depend d ON r.oid = d.objid
        JOIN pg_class cl ON d.refobjid = cl.oid
        JOIN pg_namespace n ON cl.relnamespace = n.oid
        WHERE d.deptype = 'n'
      )
      SELECT DISTINCT
        dependent_name AS table_name,
        schema_name
      FROM view_dependencies
      WHERE NOT is_view; -- Exclude intermediate views
    `,[t])).rows.map(s=>({table_name:s.table_name,schema_name:s.schema_name}))}async function fe(e,t,n){let s=t.filter(r=>!n.has(`${r.schema_name}_${r.table_name}`)).map(r=>`
      CREATE OR REPLACE FUNCTION "_notify_${r.schema_name}_${r.table_name}"() RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('table_change__${r.schema_name}__${r.table_name}', '');
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
      CREATE OR REPLACE TRIGGER "_notify_trigger_${r.schema_name}_${r.table_name}"
      AFTER INSERT OR UPDATE OR DELETE ON "${r.schema_name}"."${r.table_name}"
      FOR EACH STATEMENT EXECUTE FUNCTION "_notify_${r.schema_name}_${r.table_name}"();
      `).join(`
`);s.trim()!==""&&await e.exec(s),t.map(r=>n.add(`${r.schema_name}_${r.table_name}`))}var z=(e,t)=>{for(let n of e)n(t)},lt=(e,t)=>{for(let n of e)n(t)};0&&(module.exports={live});
//# sourceMappingURL=index.cjs.map