// Minimal SMTP-klient för implicit TLS (port 465). Lösenordet tas bort ur alla fel.
export class SmtpError extends Error {
  constructor(public stage: string, message: string) { super(message); }
}

export async function sendSmtp(o: {
  host: string; port: number; user: string; password: string;
  from: string; to: string[]; data: string; timeoutMs?: number;
}): Promise<string> {
  const timeout = o.timeoutMs ?? 20000;
  const scrub = (s: string) => s.split(o.password).join("***");
  const enc = new TextEncoder(); const dec = new TextDecoder();
  let conn: Deno.TlsConn;
  try {
    conn = await withTimeout(Deno.connectTls({ hostname: o.host, port: o.port }), timeout, "anslutning");
  } catch (e) {
    throw new SmtpError("anslutning", `Kunde inte ansluta till ${o.host}:${o.port} – ${scrub(String((e as Error)?.message ?? e))}`);
  }
  let buf = "";
  const readReply = async (): Promise<{ code: number; text: string }> => {
    const chunk = new Uint8Array(4096);
    while (true) {
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const text = lines.slice(0, i + 1).join("\n");
          buf = lines.slice(i + 1).join("\r\n");
          return { code: Number(lines[i].slice(0, 3)), text };
        }
      }
      const n = await withTimeout(conn.read(chunk), timeout, "svar");
      if (n === null) throw new Error("Servern stängde anslutningen");
      buf += dec.decode(chunk.subarray(0, n));
    }
  };
  const cmd = async (line: string | null, stage: string, ok: number[], display?: string) => {
    if (line !== null) await conn.write(enc.encode(line + "\r\n"));
    const r = await readReply();
    if (!ok.includes(r.code)) {
      if (stage === "inloggning") throw new SmtpError(stage, `Loopia nekade inloggningen (${r.code}) – kontrollera LOOPIA_SMTP_PASSWORD. ${scrub(r.text)}`);
      throw new SmtpError(stage, `${display ?? stage}: ${r.code} ${scrub(r.text)}`);
    }
    return r;
  };
  try {
    await cmd(null, "hälsning", [220]);
    await cmd(`EHLO makrilltrade.com`, "EHLO", [250]);
    await cmd("AUTH LOGIN", "inloggning", [334]);
    await cmd(btoa(o.user), "inloggning", [334]);
    await cmd(b64(o.password), "inloggning", [235]);
    await cmd(`MAIL FROM:<${o.from}>`, "avsändare", [250], `Avsändaren ${o.from} avvisades`);
    for (const r of o.to) await cmd(`RCPT TO:<${r}>`, "mottagare", [250, 251], `Mottagaren ${r} avvisades`);
    await cmd("DATA", "DATA", [354]);
    const body = o.data.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const r = await cmd(body + "\r\n.", "DATA", [250]);
    try { await conn.write(enc.encode("QUIT\r\n")); } catch { /* ignore */ }
    return r.text;
  } catch (e) {
    if (e instanceof SmtpError) throw e;
    throw new SmtpError("anslutning", `Fel mot ${o.host}:${o.port} – ${scrub(String((e as Error)?.message ?? e))}`);
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

function b64(s: string) {
  const by = new TextEncoder().encode(s); let o = "";
  for (let i = 0; i < by.length; i += 8192) o += String.fromCharCode(...by.subarray(i, i + 8192));
  return btoa(o);
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: number;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`tidsgräns (${what}, ${ms / 1000} s)`)), ms); }),
  ]);
}
