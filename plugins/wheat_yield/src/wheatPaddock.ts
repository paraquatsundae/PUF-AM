/** A paddock this scout should offer. Named wheat, or an unnamed broadacre paddock. */
export function isWheatScoutPaddock(block: {
  cropKind?: string | null;
  cultivar?: string | null;
  seasonLabel?: string | null;
  species?: string | null;
}): boolean {
  const named = `${block.cultivar ?? ''} ${block.seasonLabel ?? ''} ${block.species ?? ''}`.toLowerCase();
  if (named.includes('wheat')) return true;
  return block.cropKind === 'broadacre' && !(block.cultivar ?? '').trim();
}
