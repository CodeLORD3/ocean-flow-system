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

  async searchUnseenUids(): Promise<number[]> {
    const res = await this.command("UID SEARCH UNSEEN");
    const line = res.lines.find((l) => l.startsWith("* SEARCH")) || "";
    return line
      .replace("* SEARCH", "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
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
    const text = this.decoder.decode(raw);
    const lines = text.split(/\r?\n/);
    const finalLine = lines.find((l) => l.startsWith(`${tag} `)) || "";
    const ok = /^\S+ OK/.test(finalLine);
    let literal: Uint8Array | undefined;
    if (wantLiteral) literal = extractLiteral(raw);
    return { ok, text, lines, literal };
  }

  private async readUntilTag(tag: string) {
    return await this.readUntil((t) => new RegExp(`^${tag} (OK|NO|BAD)`, "m").test(t));
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
      acc += this.decoder.decode(chunk, { stream: true });
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
function extractLiteral(raw: Uint8Array): Uint8Array | undefined {
  const head = new TextDecoder().decode(raw.subarray(0, Math.min(raw.length, 2048)));
  const m = head.match(/\{(\d+)\}\r\n/);
  if (!m) return undefined;
  const size = Number(m[1]);
  const startText = head.indexOf(m[0]) + m[0].length;
  // Byte-offset = teckenoffset eftersom huvudet är ren ASCII.
  return raw.subarray(startText, startText + size);
}
