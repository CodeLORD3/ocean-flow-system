import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseMailAttachments } from "./attachments.ts";
import { SimpleImap, parseHeaders, findLiteralRange } from "./imap.ts";
import { Buffer } from "node:buffer";

Deno.test("large 2.5 MB PDF preserves every attachment byte", async () => {
  const pdf = Buffer.alloc(2_500_000, 65);
  pdf.write("%PDF-1.4");
  const source = Buffer.from([
    'From: supplier@example.org', 'Subject: =?UTF-8?Q?F=C3=B6ljesedel_121258?=',
    'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="outer"', '',
    '--outer', 'Content-Type: text/html; charset=utf-8', '', '<p>Document</p>',
    '--outer', 'Content-Type: application/pdf',
    'Content-Disposition: attachment; filename="121258.pdf"',
    'Content-Transfer-Encoding: base64', '',
    pdf.toString('base64').replace(/.{76}/g, '$&\r\n'), '--outer--', '',
  ].join('\r\n'));
  const parsed = await parseMailAttachments(source);
  assertEquals(parsed.subject, 'Följesedel 121258');
  assertEquals(parsed.attachments.length, 1);
  assertEquals(parsed.attachments[0].filename, '121258.pdf');
  assertEquals(parsed.attachments[0].contentType, 'application/pdf');
  assertEquals(new Uint8Array(parsed.attachments[0].content as ArrayBuffer), new Uint8Array(pdf));
});

Deno.test("chunked 4 MB IMAP FETCH returns intact literal and tagged status", async () => {
  const literal = new Uint8Array(4_000_000).fill(65);
  const prefix = new TextEncoder().encode(`* 1 FETCH (BODY[] {${literal.length}}\r\n`);
  const suffix = new TextEncoder().encode('\r\n)\r\nA1 OK completed\r\n');
  const response = new Uint8Array(prefix.length + literal.length + suffix.length);
  response.set(prefix); response.set(literal, prefix.length); response.set(suffix, prefix.length + literal.length);
  let offset = 0;
  const fakeConnection = {
    async write(bytes: Uint8Array) { return bytes.length; },
    async read(target: Uint8Array) {
      if (offset === response.length) return null;
      const count = Math.min(16_384, response.length - offset);
      target.set(response.subarray(offset, offset + count)); offset += count; return count;
    },
  };
  const client = new SimpleImap('unused');
  Object.assign(client, { conn: fakeConnection });
  const bytes = await client.fetchSource(1);
  assertEquals(bytes, literal);
  assertEquals(findLiteralRange(response), { start: prefix.length, end: prefix.length + literal.length });
});

Deno.test("truncated IMAP literals fail rather than storing corrupt PDFs", async () => {
  await assertRejects(async () => {
    findLiteralRange(new TextEncoder().encode('* 1 FETCH (BODY[] {100}\r\nshort'));
  }, Error, 'Ofullständig');
});

Deno.test("folded encoded headers retain Swedish subject and sender", () => {
  const headers = parseHeaders('Subject: =?UTF-8?Q?F=C3=B6ljesedel?=\r\n 121258\r\nFrom: Supplier <sender@example.org>\r\n');
  assertEquals(headers.get('subject'), 'Följesedel 121258');
  assertEquals(headers.get('from'), 'Supplier <sender@example.org>');
});