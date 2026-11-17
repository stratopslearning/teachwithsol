import { describe, expect, it } from 'vitest';

import { serializeJsonLd } from '@/lib/marketing/jsonLd';

describe('serializeJsonLd', () => {
  it('escapes < so copy cannot break out of the script tag', () => {
    const html = serializeJsonLd({
      '@context': 'https://schema.org',
      text: '</script><script>alert(1)',
    });
    expect(html).not.toContain('</script>');
    expect(html).toContain('\\u003c/script>');
  });
});
