import{u as I,v as O,w as C}from"../chunk-EADU5A67.js";import{j as P}from"../chunk-BTBUZ646.js";P();var M=5,U=async(l,w)=>{let g=new Set,h={async query(e,$,s){let v,c,r;if(typeof e!="string"&&(v=e.signal,$=e.params,s=e.callback,c=e.offset,r=e.limit,e=e.query),c===void 0!=(r===void 0))throw new Error("offset and limit must be provided together");let a=c!==void 0&&r!==void 0,d;if(a&&(typeof c!="number"||isNaN(c)||typeof r!="number"||isNaN(r)))throw new Error("offset and limit must be numbers");let u=s?[s]:[],_=I().replace(/-/g,""),f=!1,T,y,N=async()=>{await l.transaction(async t=>{let i=$&&$.length>0?await O(l,e,$,t):e;await t.exec(`CREATE OR REPLACE TEMP VIEW live_query_${_}_view AS ${i}`),y=await q(t,`live_query_${_}_view`),await F(t,y,g),a?(await t.exec(`
              PREPARE live_query_${_}_get(int, int) AS
              SELECT * FROM live_query_${_}_view
              LIMIT $1 OFFSET $2;
            `),await t.exec(`
              PREPARE live_query_${_}_get_total_count AS
              SELECT COUNT(*) FROM live_query_${_}_view;
            `),d=(await t.query(`EXECUTE live_query_${_}_get_total_count;`)).rows[0].count,T={...await t.query(`EXECUTE live_query_${_}_get(${r}, ${c});`),offset:c,limit:r,totalCount:d}):(await t.exec(`
              PREPARE live_query_${_}_get AS
              SELECT * FROM live_query_${_}_view;
            `),T=await t.query(`EXECUTE live_query_${_}_get;`))})};await N();let A=C(async({offset:t,limit:i}={})=>{if(!a&&(t!==void 0||i!==void 0))throw new Error("offset and limit cannot be provided for non-windowed queries");if(t&&(typeof t!="number"||isNaN(t))||i&&(typeof i!="number"||isNaN(i)))throw new Error("offset and limit must be numbers");c=t??c,r=i??r;let m=async(E=0)=>{if(u.length!==0){try{a?T={...await l.query(`EXECUTE live_query_${_}_get(${r}, ${c});`),offset:c,limit:r,totalCount:d}:T=await l.query(`EXECUTE live_query_${_}_get;`)}catch(n){let p=n.message;if(p.startsWith(`prepared statement "live_query_${_}`)&&p.endsWith("does not exist")){if(E>M)throw n;await N(),m(E+1)}else throw n}if(S(u,T),a){let n=(await l.query(`EXECUTE live_query_${_}_get_total_count;`)).rows[0].count;n!==d&&(d=n,A())}}};await m()}),R=await Promise.all(y.map(t=>l.listen(`table_change__${t.schema_name}__${t.table_name}`,async()=>{A()}))),L=t=>{if(f)throw new Error("Live query is no longer active and cannot be subscribed to");u.push(t)},o=async t=>{t?u=u.filter(i=>i!==i):u=[],u.length===0&&(f=!0,await Promise.all(R.map(i=>i())),await l.exec(`
            DROP VIEW IF EXISTS live_query_${_}_view;
            DEALLOCATE live_query_${_}_get;
          `))};return v?.aborted?await o():v?.addEventListener("abort",()=>{o()},{once:!0}),S(u,T),{initialResults:T,subscribe:L,unsubscribe:o,refresh:A}},async changes(e,$,s,v){let c;if(typeof e!="string"&&(c=e.signal,$=e.params,s=e.key,v=e.callback,e=e.query),!s)throw new Error("key is required for changes queries");let r=v?[v]:[],a=I().replace(/-/g,""),d=!1,u,_=1,f,T=async()=>{await l.transaction(async o=>{let t=await O(l,e,$,o);await o.query(`CREATE OR REPLACE TEMP VIEW live_query_${a}_view AS ${t}`),u=await q(o,`live_query_${a}_view`),await F(o,u,g);let i=[...(await o.query(`
                SELECT column_name, data_type, udt_name
                FROM information_schema.columns 
                WHERE table_name = 'live_query_${a}_view'
              `)).rows,{column_name:"__after__",data_type:"integer"}];await o.exec(`
            CREATE TEMP TABLE live_query_${a}_state1 (LIKE live_query_${a}_view INCLUDING ALL);
            CREATE TEMP TABLE live_query_${a}_state2 (LIKE live_query_${a}_view INCLUDING ALL);
          `);for(let m of[1,2]){let E=m===1?2:1;await o.exec(`
              PREPARE live_query_${a}_diff${m} AS
              WITH
                prev AS (SELECT LAG("${s}") OVER () as __after__, * FROM live_query_${a}_state${E}),
                curr AS (SELECT LAG("${s}") OVER () as __after__, * FROM live_query_${a}_state${m}),
                data_diff AS (
                  -- INSERT operations: Include all columns
                  SELECT 
                    'INSERT' AS __op__,
                    ${i.map(({column_name:n})=>`curr."${n}" AS "${n}"`).join(`,
`)},
                    ARRAY[]::text[] AS __changed_columns__
                  FROM curr
                  LEFT JOIN prev ON curr.${s} = prev.${s}
                  WHERE prev.${s} IS NULL
                UNION ALL
                  -- DELETE operations: Include only the primary key
                  SELECT 
                    'DELETE' AS __op__,
                    ${i.map(({column_name:n,data_type:p,udt_name:b})=>n===s?`prev."${n}" AS "${n}"`:`NULL${p==="USER-DEFINED"?`::${b}`:""} AS "${n}"`).join(`,
`)},
                      ARRAY[]::text[] AS __changed_columns__
                  FROM prev
                  LEFT JOIN curr ON prev.${s} = curr.${s}
                  WHERE curr.${s} IS NULL
                UNION ALL
                  -- UPDATE operations: Include only changed columns
                  SELECT 
                    'UPDATE' AS __op__,
                    ${i.map(({column_name:n,data_type:p,udt_name:b})=>n===s?`curr."${n}" AS "${n}"`:`CASE 
                              WHEN curr."${n}" IS DISTINCT FROM prev."${n}" 
                              THEN curr."${n}"
                              ELSE NULL${p==="USER-DEFINED"?`::${b}`:""}
                              END AS "${n}"`).join(`,
`)},
                      ARRAY(SELECT unnest FROM unnest(ARRAY[${i.filter(({column_name:n})=>n!==s).map(({column_name:n})=>`CASE
                              WHEN curr."${n}" IS DISTINCT FROM prev."${n}" 
                              THEN '${n}' 
                              ELSE NULL 
                              END`).join(", ")}]) WHERE unnest IS NOT NULL) AS __changed_columns__
                  FROM curr
                  INNER JOIN prev ON curr.${s} = prev.${s}
                  WHERE NOT (curr IS NOT DISTINCT FROM prev)
                )
              SELECT * FROM data_diff;
            `)}})};await T();let y=C(async()=>{if(r.length===0&&f)return;let o=!1;for(let t=0;t<5;t++)try{await l.transaction(async i=>{await i.exec(`
                INSERT INTO live_query_${a}_state${_} 
                  SELECT * FROM live_query_${a}_view;
              `),f=await i.query(`EXECUTE live_query_${a}_diff${_};`),_=_===1?2:1,await i.exec(`
                TRUNCATE live_query_${a}_state${_};
              `)});break}catch(i){if(i.message===`relation "live_query_${a}_state${_}" does not exist`){o=!0,await T();continue}else throw i}D(r,[...o?[{__op__:"RESET"}]:[],...f.rows])}),N=await Promise.all(u.map(o=>l.listen(`table_change__${o.schema_name}__${o.table_name}`,async()=>y()))),A=o=>{if(d)throw new Error("Live query is no longer active and cannot be subscribed to");r.push(o)},R=async o=>{o?r=r.filter(t=>t!==t):r=[],r.length===0&&(d=!0,await Promise.all(N.map(t=>t())),await l.exec(`
            DROP VIEW IF EXISTS live_query_${a}_view;
            DROP TABLE IF EXISTS live_query_${a}_state1;
            DROP TABLE IF EXISTS live_query_${a}_state2;
            DEALLOCATE live_query_${a}_diff1;
            DEALLOCATE live_query_${a}_diff2;
          `))};return c?.aborted?await R():c?.addEventListener("abort",()=>{R()},{once:!0}),await y(),{fields:f.fields.filter(o=>!["__after__","__op__","__changed_columns__"].includes(o.name)),initialChanges:f.rows,subscribe:A,unsubscribe:R,refresh:y}},async incrementalQuery(e,$,s,v){let c;if(typeof e!="string"&&(c=e.signal,$=e.params,s=e.key,v=e.callback,e=e.query),!s)throw new Error("key is required for incremental queries");let r=v?[v]:[],a=new Map,d=new Map,u=[],_=!0,{fields:f,unsubscribe:T,refresh:y}=await h.changes(e,$,s,R=>{for(let t of R){let{__op__:i,__changed_columns__:m,...E}=t;switch(i){case"RESET":a.clear(),d.clear();break;case"INSERT":a.set(E[s],E),d.set(E.__after__,E[s]);break;case"DELETE":{let n=a.get(E[s]);a.delete(E[s]),n.__after__!==null&&d.delete(n.__after__);break}case"UPDATE":{let n={...a.get(E[s])??{}};for(let p of m)n[p]=E[p],p==="__after__"&&d.set(E.__after__,E[s]);a.set(E[s],n);break}}}let L=[],o=null;for(let t=0;t<a.size;t++){let i=d.get(o),m=a.get(i);if(!m)break;let E={...m};delete E.__after__,L.push(E),o=i}u=L,_||S(r,{rows:L,fields:f})});_=!1,S(r,{rows:u,fields:f});let N=R=>{r.push(R)},A=async R=>{R?r=r.filter(L=>L!==L):r=[],r.length===0&&await T()};return c?.aborted?await A():c?.addEventListener("abort",()=>{A()},{once:!0}),{initialResults:{rows:u,fields:f},subscribe:N,unsubscribe:A,refresh:y}}};return{namespaceObj:h}},j={name:"Live Queries",setup:U};async function q(l,w){return(await l.query(`
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
    `,[w])).rows.map(h=>({table_name:h.table_name,schema_name:h.schema_name}))}async function F(l,w,g){let h=w.filter(e=>!g.has(`${e.schema_name}_${e.table_name}`)).map(e=>`
      CREATE OR REPLACE FUNCTION "_notify_${e.schema_name}_${e.table_name}"() RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('table_change__${e.schema_name}__${e.table_name}', '');
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
      CREATE OR REPLACE TRIGGER "_notify_trigger_${e.schema_name}_${e.table_name}"
      AFTER INSERT OR UPDATE OR DELETE ON "${e.schema_name}"."${e.table_name}"
      FOR EACH STATEMENT EXECUTE FUNCTION "_notify_${e.schema_name}_${e.table_name}"();
      `).join(`
`);h.trim()!==""&&await l.exec(h),w.map(e=>g.add(`${e.schema_name}_${e.table_name}`))}var S=(l,w)=>{for(let g of l)g(w)},D=(l,w)=>{for(let g of l)g(w)};export{j as live};
//# sourceMappingURL=index.js.map