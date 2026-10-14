/* Skillforge LMS — Settings › Migration › SCORM setup check (v41.15).
 * One button runs every check that decides whether SCORM / HTML5 / xAPI packages can play, and says what to fix:
 *   1. js/config.js has CONTENT_ORIGIN
 *   2. the content site answers /health (new code deployed, its 3 variables, the "content" function)
 *   3. every package module: its files are in the lms-scorm bucket, and the courses that use it point to it
 *   4. a real launch of the first package, followed file by file through the content site
 */
SkillforgeApp.prototype.amContentCheck = function (c) {
  const { s } = c, R = s.ccRes || null;
  const cfg = window.SKILLFORGE_CONFIG || {}, CO = String(cfg.CONTENT_ORIGIN || '').replace(/\/$/, '');
  const run = async () => {
    const rows = [], add = (group, name, ok, detail, fix) => rows.push({ group, name, ok, detail: detail || '', fix: fix || '' });
    this.setState({ ccBusy: true, ccRes: null });
    try {
      add('Settings', 'Supabase connected', Backend.on, Backend.on ? 'ok' : 'js/config.js has no SUPABASE_URL', 'Fill SUPABASE_URL and SUPABASE_ANON_KEY in public/js/config.js');
      add('Settings', 'CONTENT_ORIGIN in config.js', !!CO, CO || 'empty', 'Set CONTENT_ORIGIN in public/js/config.js to the content site address, e.g. https://skillforge-db.pages.dev');
      // v41.18: SCORM packages run their own JavaScript. On the app's own address they could read the signed-in person's session.
      if (CO) add('Settings', 'Content site is a different address from the LMS', CO !== location.origin, CO === location.origin ? 'both are ' + CO : 'LMS ' + location.origin + ' · content ' + CO,
        'Use a separate Cloudflare Pages project (Root directory: content-site) for CONTENT_ORIGIN; never the LMS address itself');
      // 2. content site
      let h = null;
      if (CO) { try { const r = await fetch(CO + '/health', { cache: 'no-store' }); const t = await r.text(); try { h = JSON.parse(t); } catch (e) { h = null; } } catch (e) { h = null; }
        add('Content site', 'Content site runs the latest code', !!(h && h.version), h && h.version ? h.version : 'no answer from ' + CO + '/health',
          'In Cloudflare open the content site project › Deployments: the latest deployment must be from the newest GitHub commit (Retry deployment). Its Root directory must be content-site.');
        (h && h.checks || []).forEach(x => add('Content site', x.name, !!x.ok, x.detail, x.ok ? '' : 'Content site › Settings › Variables and Secrets (Production), then Retry deployment'));
      }
      // 3. packages
      const pk = (s.lcms || []).filter(m => (MOD_TYPES[m.type] || {}).pkg);
      if (!pk.length) add('Packages', 'Packages in LCMS', false, 'no SCORM / HTML5 / xAPI module yet', 'Upload a package in LCMS › + Add module');
      const sb = Backend.on ? Backend.client() : null;
      for (const m of pk.slice(0, 20)) {
        const f = m.file || {}, used = (s.adminCourses || []).filter(a => (a.items || []).some(it => it.moduleId === m.id)).map(a => a.title);
        if (!f.path) { add('Packages', m.code + ' · ' + m.title, false, 'uploaded before the package fix: it has no files in storage', 'Edit the module in LCMS, upload the .zip again and save'); continue; }
        let names = null; if (sb) { const { data } = await sb.storage.from('lms-scorm').list(f.path.replace(/\/$/, ''), { limit: 1000 }); names = (data || []).map(x => x.name); }
        const launchTop = String(f.launch || '').split('/')[0];
        const ok = !names || names.includes(launchTop);
        add('Packages', m.code + ' · ' + m.title, ok, ok ? (names ? names.length + ' files · starts at ' + f.launch : 'ok') + (used.length ? ' · used in ' + used.join(', ') : ' · not used in a course')
          : 'no files at ' + f.path + ' (start page ' + f.launch + ' missing)', 'Edit the module in LCMS and upload the .zip again; courses using it update automatically');
      }
      // course steps that point to a deleted module
      (s.adminCourses || []).forEach(a => (a.items || []).forEach((it, i) => { if (['scorm', 'html', 'xapi'].includes(it.kind) && it.moduleId && !(s.lcms || []).some(m => m.id === it.moduleId))
        add('Packages', a.title + ' · step ' + (i + 1), false, 'points to a module that no longer exists in LCMS', 'Open the course, remove this step and add the package again'); }));
      // 4. a real launch, followed through the content site
      const first = pk.find(m => m.file && m.file.path);
      if (first && Backend.on && h && h.version) {
        try { const url = await Backend.scormPreview(first.id), u = new URL(url), parts = u.pathname.split('/').slice(2), tok = parts[0], file = parts.slice(1).map(decodeURIComponent).join('/');
          add('Real launch · ' + first.code, '0. Skillforge creates the launch link', true, u.origin + '/c/…/' + file);
          add('Real launch · ' + first.code, 'Launch link goes to CONTENT_ORIGIN', u.origin === CO, u.origin, 'Supabase › Edge Functions › Secrets: CONTENT_ORIGIN must be exactly ' + CO);
          const r = await fetch(CO + '/health?t=' + encodeURIComponent(tok) + '&f=' + encodeURIComponent(file), { cache: 'no-store' }), d = await r.json();
          (d.checks || []).filter(x => /^\d\.|hint/.test(x.name)).forEach(x => add('Real launch · ' + first.code, x.name, !!x.ok, x.detail));
        } catch (e) { add('Real launch · ' + first.code, 'Skillforge creates the launch link', false, e.message, 'Check the Supabase secrets CONTENT_ORIGIN and CONTENT_SIGNING_KEY, then run deploy-functions'); }
        try { Backend.scormLeave && Backend.scormLeave(); } catch (e) {}
      }
    } catch (e) { add('Check', 'The check itself', false, e.message); }
    this.setState({ ccBusy: false, ccRes: { at: new Date().toISOString(), rows } });
  };
  const rows = R ? R.rows : [], bad = rows.filter(x => !x.ok);
  return {
    ccRun: run, ccBusy: !!s.ccBusy, ccHas: !!R, ccNone: !R && !s.ccBusy, ccOrigin: CO || '(not set)',
    ccSummary: !R ? '' : bad.length ? bad.length + (bad.length === 1 ? ' problem' : ' problems') + ' found. Fix the first one, then run the check again.' : 'Everything passed. SCORM packages should play.',
    ccSumBg: bad.length ? '#FDECEC' : '#DCFCE7', ccSumFg: bad.length ? '#A63232' : '#166534', ccWhen: R ? 'Checked ' + Fmt.dt(R.at) : '',
    ccRows: rows.map((x, i) => ({ ...x, mark: x.ok ? '✓' : '✕', mBg: x.ok ? '#08AE6E' : '#D64545', head: i === 0 || rows[i - 1].group !== x.group ? x.group : '', hasFix: !x.ok && !!x.fix })),
  };
};
