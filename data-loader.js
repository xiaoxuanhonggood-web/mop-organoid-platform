// Load the published snapshot with bounded requests and lossless compression.
export async function requestJson(url, compressed = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), /papers-/.test(url) ? 180000 : 45000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!compressed) return await response.json();
    const bytes = await response.arrayBuffer();
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).json();
  } finally { clearTimeout(timer); }
}

export async function loadSnapshot(progress) {
  const [snapshot, settings] = await Promise.all([
    requestJson('data.json'), requestJson('settings.json')
  ]);
  if (!snapshot.paperFiles) return [snapshot, settings];
  const finish = async () => {
  let completed = 0;
  progress(0, snapshot.paperFiles.length);
  const parts = await Promise.all(snapshot.paperFiles.map(async (file, index) => {
    let records;
    const compressed = snapshot.compressedPaperFiles?.[index];
    if (compressed && typeof DecompressionStream !== 'undefined') {
      try { records = await requestJson(compressed, true); }
      catch { records = await requestJson(file); }
    } else records = await requestJson(file);
    if (!Array.isArray(records)) throw new Error('文献数据格式错误');
    progress(++completed, snapshot.paperFiles.length);
    return records;
  }));
  snapshot.papers = parts.flat();
  };
  if (snapshot.papers?.length) {
    snapshot.loadRemaining = finish;
  } else await finish();
  return [snapshot, settings];
}
