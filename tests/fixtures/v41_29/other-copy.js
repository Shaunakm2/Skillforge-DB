/* a feature file with its own copy of the download code (single line, double quotes, different timing) */
const Other = { save(name, text) { const url = URL.createObjectURL(new Blob([text], { type: "text/plain" })), a = document.createElement("a"); a.href = url; a.download = name + '.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500); } };
const Preview = { show(f) { return URL.createObjectURL(f); } };   // a preview link, not a download: must be left alone
