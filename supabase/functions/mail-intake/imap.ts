// Minimal IMAP-klient över Deno TLS.
// imapflow kan inte läsa meddelandekroppar i edge-runtimen (FETCH hänger),
// därför pratar vi IMAP direkt med bara de kommandon vi behöver.

export class SimpleImap {
  private conn: Deno.TlsConn | null = null;
  private buf = new Uint8Array(0);
  private tag = 0;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  constructor(private host: string, private port = 993) {}

  async connect(user: string, pass: string) {
    this.conn = await Deno.connectTls({ hostname: this.host, port: this.port });
    await this.readUntil((t) => /^\* OK/m.test(t));
    const res = await this.command(`LOGIN ${quote(user)} ${quote(pass)}`);
    if (!res.ok) throw new Error(`IMAP LOGIN misslyckades: ${res.text}`);
  }

  async close() {
    try {
      if (this.conn) {
        await this.command("LOGOUT");
        this.conn.close();
      }
    } catch {
      /* ignoreras */
    }
    this.conn = null;
  }

  async listMailboxes(): Promise<string[]> {
    const res = await this.command('LIST "" "*"');
    return res.lines
      .filter((l) => l.startsWith("* LIST"))
      .map((l) => {
        const m = l.match(/"([^"]*)"\s*$/) || l.match(/\s(\S+)\s*$/);
        return m ? m[1] : "";
      })
      .filter(Boolean);
  }

  async select(mailbox: string) {
    const res = await this.command(`SELECT ${quote(mailbox)}`);
    if (!res.ok) throw new Error(`IMAP SELECT ${mailbox} misslyckades: ${res.text}`);
  }

  async createMailbox(mailbox: string) {
    await this.command(`CREATE ${quote(mailbox)}`);
  }

  /** Olästa mejl som inte redan granskats och lämnats kvar (t.ex. utan bilaga). */
  async searchUnseenUids(skipKeyword?: string): Promise<number[]> {
    const res = await this.command(skipKeyword ? `UID SEARCH UNSEEN UNKEYWORD ${skipKeyword}` : "UID SEARCH UNSEEN");
    const line = res.lines.find((l) => l.startsWith("* SEARCH")) || "";
    return line
      .replace("* SEARCH", "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
  }

  /** Avgränsad återhämtning av ett tidigare överhoppat mejl. */
  async searchSubjectUids(subject: string): Promise<number[]> {
    const res = await this.command(`UID SEARCH UNSEEN SUBJECT ${quote(subject)}`);
    return (res.lines.find((line) => line.startsWith("* SEARCH")) || "")
      .replace("* SEARCH", "").trim().split(/\s+/).map(Number)
      .filter((uid) => Number.isInteger(uid) && uid > 0);
  }

  /** Hämtar hela råmeddelandet utan att sätta \Seen. */
  async fetchSource(uid: number): Promise<Uint8Array | null> {
    const res = await this.command(`UID FETCH ${uid} BODY.PEEK[]`, true);
    if (!res.ok || !res.literal) return null;
    return res.literal;
  }

  /**
   * Hämtar bara headers + storlek. Billigt jämfört med hela mejlet, så filtren
   * (nyhetsbrev, påminnelse, okänd avsändare) kan köras utan att ladda ner
   * megabyte av bilder och utan att elda upp CPU-budgeten i mailparser.
   */
  async fetchHeaders(uid: number): Promise<{ headers: Map<string, string>; size: number } | null> {
    const res = await this.command(`UID FETCH ${uid} (RFC822.SIZE BODY.PEEK[HEADER])`, true);
    if (!res.ok || !res.literal) return null;
    const size = Number(res.text.match(/RFC822\.SIZE (\d+)/i)?.[1] ?? 0);
    return { headers: parseHeaders(new TextDecoder().decode(res.literal)), size };
  }


  /** Sätter en egen markering utan att mejlet blir läst. */
  async addKeyword(uid: number, keyword: string) {
    await this.command(`UID STORE ${uid} +FLAGS (${keyword})`);
  }

  async markSeen(uid: number) {
    await this.command(`UID STORE ${uid} +FLAGS (\\Seen)`);
  }

  async moveUid(uid: number, mailbox: string) {
    const res = await this.command(`UID MOVE ${uid} ${quote(mailbox)}`);
    if (!res.ok) {
      await this.command(`UID COPY ${uid} ${quote(mailbox)}`);
      await this.command(`UID STORE ${uid} +FLAGS (\\Deleted)`);
      await this.command("EXPUNGE");
    }
  }

  // ---- internt ----

  private async command(cmd: string, wantLiteral = false) {
    if (!this.conn) throw new Error("IMAP inte ansluten");
    const tag = `A${++this.tag}`;
    await this.conn.write(this.encoder.encode(`${tag} ${cmd}\r\n`));
    const raw = await this.readUntilTag(tag);
    // A FETCH literal can contain megabytes of MIME data. Only decode the
    // response framing, never the entire attachment to look for tagged OK.
    const literalRange = findLiteralRange(raw);
    const text = literalRange
      ? this.decoder.decode(raw.subarray(0, literalRange.start)) +
        this.decoder.decode(raw.subarray(literalRange.end))
      : this.decoder.decode(raw);
    const lines = text.split(/\r?\n/);
    const finalLine = lines.find((l) => l.startsWith(`${tag} `)) || "";
    const ok = /^\S+ OK/.test(finalLine);
    let literal: Uint8Array | undefined;
    if (wantLiteral) literal = extractLiteral(raw);
    return { ok, text, lines, literal };
  }

  private async readUntilTag(tag: string) {
    const complete = new RegExp(`(?:^|\r?\n)${tag} (OK|NO|BAD)[^\r\n]*\r?\n$`);
    return await this.readUntil((t) => complete.test(t));
  }

  private async readUntil(done: (text: string) => boolean, timeoutMs = 30000) {
    if (!this.conn) throw new Error("IMAP inte ansluten");
    const start = Date.now();
    const chunks: Uint8Array[] = [];
    let acc = "";
    while (true) {
      if (Date.now() - start > timeoutMs) throw new Error("IMAP timeout");
      const tmp = new Uint8Array(65536);
      const n = await this.conn.read(tmp);
      if (n === null) throw new Error("IMAP-anslutningen stängdes");
      const chunk = tmp.subarray(0, n);
      chunks.push(new Uint8Array(chunk));
      // Keep completion detection bounded instead of rescanning/copying an
      // ever-growing multi-megabyte string after every network read.
      acc = (acc + this.decoder.decode(chunk, { stream: true })).slice(-2048);
      if (done(acc)) break;
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    this.buf = new Uint8Array(0);
    return merged;
  }
}

function quote(v: string) {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Plockar ut {n} -literalen ur ett FETCH-svar. */
export function findLiteralRange(raw: Uint8Array): { start: number; end: number } | undefined {
  const head = new TextDecoder().decode(raw.subarray(0, Math.min(raw.length, 2048)));
  const m = head.match(/\{(\d+)\}\r\n/);
  if (!m) return undefined;
  const size = Number(m[1]);
  const startText = head.indexOf(m[0]) + m[0].length;
  // Byte-offset = teckenoffset eftersom huvudet är ren ASCII.
  if (startText + size > raw.length) throw new Error("Ofullständig IMAP-bilaga");
  return { start: startText, end: startText + size };
}

function extractLiteral(raw: Uint8Array): Uint8Array | undefined {
  const range = findLiteralRange(raw);
  return range ? raw.subarray(range.start, range.end) : undefined;
}


/** Avkodar MIME encoded-words (=?UTF-8?B?..?=) så ämnesrader kan filtreras. */
export function decodeMimeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset, enc, data) => {
    try {
      let bytes: Uint8Array;
      if (enc.toLowerCase() === "b") {
        const bin = atob(data.replace(/\s+/g, ""));
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else {
        const text = String(data).replace(/_/g, " ");
        const out: number[] = [];
        for (let i = 0; i < text.length; i++) {
          if (text[i] === "=" && /^[0-9a-fA-F]{2}$/.test(text.slice(i + 1, i + 3))) {
            out.push(parseInt(text.slice(i + 1, i + 3), 16));
            i += 2;
          } else {
            out.push(text.charCodeAt(i));
          }
        }
        bytes = new Uint8Array(out);
      }
      return new TextDecoder(String(charset).toLowerCase()).decode(bytes);
    } catch {
      return data;
    }
  });
}

/** Enkel header-parsning: unfoldar rader och nycklar i gemener. */
export function parseHeaders(raw: string): Map<string, string> {
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ");
  const map = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = decodeMimeWords(line.slice(idx + 1).trim());
    map.set(key, map.has(key) ? `${map.get(key)} ${value}` : value);
  }
  return map;
}

/** Plockar ut namn och adress ur en From-header. */
export function parseAddress(value?: string | null): { name: string | null; email: string } {
  const v = (value || "").trim();
  const angle = v.match(/<([^>]+)>/);
  const email = (angle ? angle[1] : v.split(/\s+/).pop() || "").trim().toLowerCase();
  let name = angle ? v.slice(0, v.indexOf("<")).trim() : "";
  name = name.replace(/^"|"$/g, "").trim();
  return { name: name || null, email };
}

