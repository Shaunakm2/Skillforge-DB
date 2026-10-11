/* Loads the Supabase client from this site (vendor/supabase.js, pinned version — see scripts/vendor-supabase.sh)
 * only when js/config.js is filled in. No third-party script host is used, so the Content-Security-Policy can
 * allow scripts from this site only. */
(function () {
  // Clickjacking guard. The frame-ancestors header protects hosted builds (Cloudflare, Netlify…), but GitHub Pages and a file
  // opened from disk cannot send headers: there the page refuses to show inside another site's frame.
  if (window.top !== window.self) { var ok = false; try { ok = window.top.location.origin === window.location.origin; } catch (e) { ok = false; }
    if (!ok) { document.documentElement.style.display = 'none'; try { window.top.location.replace(window.location.href); } catch (e) {} } }
  var c = window.SKILLFORGE_CONFIG || {};
  if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) document.write('<script src="vendor/supabase.js"><\/script>');
})();
