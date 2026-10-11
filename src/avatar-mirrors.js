export function mirrorPlan(index, indexUrl, permission) {
  if (index.format !== 'deepcoin-avatars/1' || !Array.isArray(index.avatars)) throw Error('形象索引格式錯誤');
  if (!permission || new URL(permission).protocol !== 'https:') throw Error('缺少發布許可來源');
  return index.avatars.map(entry => {
    const url = new URL(entry.file, indexUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('角色包需要 HTTPS 直連網址');
    if (!/^[a-f0-9]{64}$/i.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 300 * 1024 * 1024) throw Error('角色包大小或 SHA 格式錯誤');
    if (!Array.isArray(entry.authors) || !entry.authors.length || !entry.license) throw Error('角色包缺少署名或許可說明');
    const extension = /\.(zip|vrm|glb)$/i.exec(url.pathname)?.[1].toLowerCase();
    if (!extension) throw Error('不支援的角色包格式');
    return {...entry, url:url.href, path:`avatar-packages/${entry.sha256.toLowerCase()}.${extension}`, permission};
  });
}

export function mirroredUrl(value, catalog, base) {
  const url = new URL(value).href;
  const path = catalog?.files?.[url];
  if (catalog?.format !== 'deepcoin-avatar-mirrors/1' || typeof path !== 'string' || !/^avatar-packages\/[a-f0-9]{64}\.(zip|vrm|glb)$/.test(path)) return url;
  return new URL(path, base).href;
}
