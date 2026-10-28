import { researchBundle } from './reproducibility.js';
import { csv, notebook, downloadArtifact } from './notebook.js';
export function mountPython(host, code, { auto = false, context = {} } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'python-card';
  const editor = document.createElement('textarea');
  editor.className = 'python-code';
  editor.spellcheck = false;
  editor.setAttribute('aria-label', 'Python code');
  editor.value = code;
  editor.rows = 12;
  const actions = document.createElement('div');
  actions.className = 'science-actions';
  const run = document.createElement('button');
  run.className = 'primary';
  run.textContent = 'Run Python';
  const stop = document.createElement('button');
  stop.className = 'secondary';
  stop.textContent = 'Stop / reset';
  const download = document.createElement('button');
  download.className = 'secondary';
  download.textContent = 'Download script';
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.setAttribute('aria-label', 'Upload science data or SPICE kernels');
  upload.accept = '.bsp,.tls,.tpc,.tf,.bc,.tsc,.csv,.json,.fits,.fit,.txt';
  const packages = document.createElement('select');
  packages.setAttribute('aria-label', 'Optional scientific package');
  packages.innerHTML =
    '<option value="">Add a package…</option><option value="skyfield">Skyfield</option><option value="spiceypy">SPICE (experimental)</option>';
  const note = document.createElement('p');
  note.className = 'science-note';
  note.textContent =
    'Runs on this device. Review edited or AI-written code before running. Uploads stay in this temporary session (64 MB/file). Stop resets Python and clears files. Poliastro is not available in this runtime.';
  const status = document.createElement('p');
  status.className = 'science-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Ready to load Python on first use.';
  const output = document.createElement('pre');
  output.className = 'python-output';
  output.setAttribute('aria-label', 'Python output');
  const images = document.createElement('div');
  let execution = null,
    pending = null,
    runCode = '',
    plots = [],
    rows = [],
    provenance = {},
    limits = {};
  const explain = document.createElement('button');
  explain.className = 'secondary';
  explain.textContent = 'Explain result';
  explain.disabled = true;
  explain.onclick = () => window.SpaceMindUI?.explain(execution);
  const exportNotebook = document.createElement('button');
  exportNotebook.className = 'secondary';
  exportNotebook.textContent = 'Export notebook';
  exportNotebook.disabled = true;
  exportNotebook.onclick = () =>
    downloadArtifact(
      JSON.stringify(notebook(execution), null, 2),
      'spacemind-notebook.ipynb',
    );
  const includeLabel = document.createElement('label'),
    includeInputs = document.createElement('input');
  includeInputs.type = 'checkbox';
  includeLabel.append(
    includeInputs,
    document.createTextNode(
      'Include input files in next run’s export (only files you may share; up to 16 MB)',
    ),
  );
  const exportBundle = document.createElement('button');
  exportBundle.className = 'secondary';
  exportBundle.textContent = 'Export reproducibility bundle';
  exportBundle.disabled = true;
  exportBundle.onclick = async () => {
    const captured = execution;
    try {
      downloadArtifact(
        JSON.stringify(await researchBundle(captured, notebook), null, 2),
        'spacemind-research-bundle.json',
      );
    } catch (e) {
      status.textContent = e.message;
    }
  };
  const saveProject = document.createElement('button');
  saveProject.className = 'secondary';
  saveProject.textContent = 'Save to project';
  saveProject.disabled = true;
  saveProject.onclick = async () => {
    try {
      await window.SpaceMindPapers.saveExecution(execution);
    } catch (e) {
      status.textContent = e.message;
    }
  };
  const exportCSV = document.createElement('button');
  exportCSV.className = 'secondary';
  exportCSV.textContent = 'Export CSV';
  exportCSV.disabled = true;
  exportCSV.onclick = () =>
    downloadArtifact(csv(rows), 'spacemind-results.csv', 'text/csv');
  const importNotebook = document.createElement('input');
  importNotebook.type = 'file';
  importNotebook.accept = '.ipynb';
  importNotebook.setAttribute('aria-label', 'Open a shared notebook');
  importNotebook.onchange = async () => {
    try {
      const file = importNotebook.files[0];
      if (!file || file.size > 5_000_000)
        throw Error('Choose a notebook smaller than 5 MB.');
      const n = JSON.parse(await file.text());
      if (n.nbformat !== 4 || !Array.isArray(n.cells))
        throw Error('Choose a version 4 notebook.');
      const code = n.cells
        .filter((c) => c.cell_type === 'code')
        .map((c) => (Array.isArray(c.source) ? c.source.join('') : c.source))
        .join('\n\n');
      if (typeof code !== 'string' || code.length > 30000)
        throw Error('Notebook code is too large.');
      editor.value = code;
      status.textContent =
        'Notebook opened. Review its code and supply data files before running.';
    } catch (e) {
      status.textContent = e.message;
    }
  };
  const resultDownload = document.createElement('button');
  resultDownload.className = 'secondary';
  resultDownload.textContent = 'Download output';
  resultDownload.onclick = () => {
    const url = URL.createObjectURL(
        new Blob([output.textContent], { type: 'text/plain' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'spacemind-output.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  actions.append(
    run,
    stop,
    download,
    resultDownload,
    exportCSV,
    exportNotebook,
    exportBundle,
    saveProject,
    explain,
    packages,
  );
  wrap.append(
    editor,
    actions,
    upload,
    importNotebook,
    includeLabel,
    note,
    status,
    output,
    images,
  );
  host.append(wrap);
  let frame,
    port,
    ready,
    resolveReady,
    loadTimer,
    disposed = false;
  function connect() {
    if (ready) return ready;
    ready = new Promise((resolve) => (resolveReady = resolve));
    frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'Isolated Python runtime';
    frame.sandbox = 'allow-scripts';
    frame.srcdoc = __PYTHON_FRAME__;
    frame.onload = () => {
      const channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') {
          clearTimeout(loadTimer);
          resolveReady(true);
          return;
        }
        if (m.type === 'stdout' || m.type === 'stderr') {
          if (output.textContent.length < 50000)
            output.textContent += m.text + '\n';
        }
        if (m.type === 'image') {
          if (!/^[A-Za-z0-9+/=]+$/.test(m.text) || m.text.length > 3_000_000)
            return;
          const img = document.createElement('img');
          img.src = 'data:image/png;base64,' + m.text;
          img.alt = 'Python-generated plot';
          images.append(img);
          plots.push(m.text);
          const save = document.createElement('button');
          save.className = 'secondary';
          save.textContent = 'Download PNG';
          const filename = 'spacemind-plot-' + plots.length + '.png';
          save.onclick = () =>
            downloadArtifact(
              Uint8Array.from(atob(m.text), (c) => c.charCodeAt(0)),
              filename,
              'image/png',
            );
          images.append(save);
        }
        if (m.type === 'table') {
          try {
            const data = JSON.parse(m.text);
            if (Array.isArray(data) && data.length <= 20000) rows = data;
          } catch {}
        }
        if (m.type === 'provenance') {
          try {
            provenance = JSON.parse(m.text);
          } catch {}
        }
        if (m.type === 'execution-limits') {
          try {
            limits = JSON.parse(m.text);
          } catch {}
        }
        if (m.type === 'status') status.textContent = m.text;
        if (m.type === 'done' && pending === 'run') {
          execution = {
            code: runCode,
            output: output.textContent,
            images: [...plots],
            csv: csv(rows),
            context: structuredClone(context),
            ...provenance,
            limits,
            completed_at: new Date().toISOString(),
          };
          explain.disabled = !execution.output.trim();
          exportNotebook.disabled = false;
          exportBundle.disabled = false;
          saveProject.disabled = false;
          exportCSV.disabled = !rows.length;
        }
        if (m.type === 'done' || m.type === 'error') {
          status.textContent = m.text;
          status.classList.toggle('error', m.type === 'error');
          setBusy(false);
        }
      };
      frame.contentWindow.postMessage({ type: 'connect-python' }, '*', [
        channel.port2,
      ]);
    };
    wrap.append(frame);
    loadTimer = setTimeout(() => {
      status.textContent =
        'Python could not load. Check your connection, then reset and retry.';
      resolveReady(false);
      setBusy(false);
    }, 20000);
    return ready;
  }
  function setBusy(value) {
    run.disabled = value;
    upload.disabled = value;
    packages.disabled = value;
    editor.readOnly = value;
    includeInputs.disabled = value;
  }
  async function send(m) {
    if (disposed) return;
    pending = m.type;
    setBusy(true);
    status.classList.remove('error');
    if (await connect()) port.postMessage(m, m.bytes ? [m.bytes] : []);
    else setBusy(false);
  }
  run.onclick = () => {
    execution = null;
    explain.disabled = true;
    exportNotebook.disabled = true;
    exportCSV.disabled = true;
    exportBundle.disabled = true;
    saveProject.disabled = true;
    provenance = {};
    limits = {};
    runCode = editor.value;
    plots = [];
    rows = [];
    output.textContent = '';
    images.replaceChildren();
    send({
      type: 'run',
      code: editor.value,
      includeInputs: includeInputs.checked,
    });
  };
  stop.onclick = () => {
    clearTimeout(loadTimer);
    resolveReady?.(false);
    port?.postMessage({ type: 'stop' });
    port?.close();
    frame?.remove();
    port = null;
    frame = null;
    ready = null;
    setBusy(false);
    status.textContent = 'Runtime reset. Uploaded files cleared.';
  };
  download.onclick = () => {
    const url = URL.createObjectURL(
        new Blob([editor.value], { type: 'text/x-python' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'spacemind-calculation.py';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  upload.onchange = async () => {
    const files = Array.from(upload.files || []);
    if (files.length !== 1) {
      status.textContent = 'Upload one file at a time.';
      return;
    }
    const file = files[0];
    if (
      file.size > 64 * 1024 * 1024 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(file.name)
    ) {
      status.textContent =
        'Use a simple filename and a file smaller than 64 MB.';
      return;
    }
    send({ type: 'upload', name: file.name, bytes: await file.arrayBuffer() });
  };
  packages.onchange = () => {
    if (packages.value) send({ type: 'install', name: packages.value });
    packages.value = '';
  };
  if (auto) run.click();
  return () => {
    disposed = true;
    stop.onclick();
  };
}
