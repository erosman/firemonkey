// ---------- match pattern --------------------------------
export class Pattern {

  static hasError(p) {
    if (this.validMatchPattern(p)) { return false; }

    if (!p.includes('://')) { return 'Invalid Pattern'; }

    p = p.toLowerCase();
    const [scheme, host, path] = p.split(/:\/{2,3}|\/+/);
    const file = scheme === 'file';

    // --- common pattern errors
    switch (true) {
      case !['http', 'https', 'file', '*'].includes(scheme):
        return scheme.includes('*') ? '"*" in scheme must be the only character' : 'Unsupported scheme';

      case file && !p.startsWith('file:///'):
        return 'file:/// must have 3 slashes';

       case !host:
        return 'Missing Host';

      case host.substring(1).includes('*'):
        return '"*" in host must be at the start';

      case host[0] === '*' && host[1] && host[1] !== '.':
        return '"*" in host must be the only character or be followed by "."';

      case !file && host.includes(':'):
        return 'Host must not include a port number';

      case !file && typeof path === 'undefined':
        return 'Missing Path';

      default:
        return 'Invalid Pattern';
    }
  }

  // --- test match pattern validity
  static validMatchPattern(p) {
    return p === '<all_urls>' ||
      /^(https?|\*):\/\/(\*|\*\.[^*:/]+|[^*:/]+)\/.*$/i.test(p) ||
      /^file:\/\/\/.+$/i.test(p);
  }
}