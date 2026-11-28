import LZString from 'lz-string';

const COMPRESSED_PREFIX='AZS-LZ1:';

export function encodeStoredSave(json:string):string {
  return json.length<200_000?json:COMPRESSED_PREFIX+LZString.compressToUTF16(json);
}

export function decodeStoredSave(data:string):string {
  if(!data.startsWith(COMPRESSED_PREFIX))return data;
  const raw=LZString.decompressFromUTF16(data.slice(COMPRESSED_PREFIX.length));
  if(!raw?.trimStart().startsWith('{'))throw new Error('Damaged compressed save');
  return raw;
}
