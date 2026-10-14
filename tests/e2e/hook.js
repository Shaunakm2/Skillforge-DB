/* v41.18: the offline browser tests always run with sample data, whatever public/js/config.js says (it holds this
 * deployment's live Supabase settings). Connected-mode tests use their own settings and do not load this file. */
(function(){let cfg;Object.defineProperty(window,'SKILLFORGE_CONFIG',{configurable:true,get(){return cfg},set(v){cfg=Object.assign({},v||{},{SUPABASE_URL:'',SUPABASE_ANON_KEY:'',CONTENT_ORIGIN:''});}});})();
(function(){let sf;Object.defineProperty(window,'Skillforge',{configurable:true,get(){return sf},set(v){const m=v.mount;v.mount=(app,...a)=>{window.__app=app;return m(app,...a)};sf=v;}});})();
