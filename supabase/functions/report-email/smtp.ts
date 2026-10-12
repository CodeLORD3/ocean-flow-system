// Minimal SMTP-klient för implicit TLS (port 465). Lösenordet tas bort ur alla fel.
// Varje steg loggas; fel och tidsgränser anger vilket steg som föll.
export class SmtpError extends Error {
  constructor(public stage: string, message: string) { super(message); }
}

export type SmtpOpts = {
  host: string; port: number; user: string; password: string;
  from: string; to: string[]; data: string; timeoutMs?: number; dataTimeoutMs?: number;
  probeOnly?: boolean; // hälsning + EHLO + AUTH, sedan QUIT utan att skicka
};

export async function sendSmtp(o: SmtpOpts): Promise<{ reply: string; steps: string[] }> {
  const timeout = o.timeoutMs ?? 20000;
  const dataTimeout = o.dataTimeoutMs ?? 60000;
  const scrub = (s: string) => (o.password ? s.split(o.password).join("***") : s);
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const steps: string[] = [];
  let stage = "anslutning";
  let conn: Deno.TlsConn;
  try {
    conn = await withTimeout(Deno.connectTls({ hostname: o.host, port: o.port }), timeout);
  } catch (e) {
    throw new SmtpError("anslutning", `Kunde inte ansluta till ${o.host}:${o.port} – ${scrub(errText(e))}`);
  }
  steps.push("anslutning ok");

  const writeAll = async (bytes: Uint8Array) => {
    let off = 0;
    while (off < bytes.length) {
      const n = await conn.write(bytes.subarray(off));
      if (n <= 0) throw new Error("kunde inte skriva till servern");
      off += n;
    }
  };

  let buf = "";
  const chunk = new Uint8Array(8192);
  const readReply = async (ms: number): Promise<{ code: number; text: string }> => {
    while (true) {
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const text = lines.slice(0, i + 1).join("\n");
          buf = lines.slice(i + 1).join("\r\n");
          return { code: Number(lines[i].slice(0, 3)), text };
        }
      }
      const n = await withTimeout(conn.read(chunk), ms);
      if (n === null) throw new Error("servern stängde anslutningen");
      buf += dec.decode(chunk.subarray(0, n));
    }
  };

  const step = async (name: string, line: string | null, ok: number[], opts: { ms?: number; display?: string } = {}) => {
    stage = name;
    if (line !== null) await writeAll(enc.encode(line + "\r\n"));
    const r = await readReply(opts.ms ?? timeout);
    if (!ok.includes(r.code)) {
      if (name.startsWith("AUTH")) throw new SmtpError(name, `Loopia nekade inloggningen i steg ${name} (${r.code}) – kontrollera LOOPIA_SMTP_PASSWORD. ${scrub(r.text)}`);
      throw new SmtpError(name, `${opts.display ?? `Steg ${name}`}: ${r.code} ${scrub(r.text)}`);
    }
    steps.push(`${name} ok (${r.code})`);
    return r;
  };

  try {
    await step("hälsning", null, [220]);
    await step("EHLO", "EHLO makrilltrade.com", [250]);
    await step("AUTH", "AUTH LOGIN", [334]);
    await step("AUTH användare", b64(o.user), [334]);
    await step("AUTH lösenord", b64(o.password), [235]);
    if (o.probeOnly) {
      try { await writeAll(enc.encode("QUIT\r\n")); } catch { /* ignore */ }
      return { reply: "probe ok", steps };
    }
    await step("MAIL FROM", `MAIL FROM:<${o.from}>`, [250], { display: `Avsändaren ${o.from} avvisades` });
    for (const r of o.to) await step(`RCPT TO ${r}`, `RCPT TO:<${r}>`, [250, 251], { display: `Mottagaren ${r} avvisades` });
    await step("DATA", "DATA", [354]);
    stage = "DATA-kropp";
    const body = o.data.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    await writeAll(enc.encode(body + "\r\n"));
    steps.push(`DATA-kropp skriven (${body.length} tecken)`);
    const r = await step("slut-punkt", ".", [250], { ms: dataTimeout });
    try { await writeAll(enc.encode("QUIT\r\n")); } catch { /* ignore */ }
    return { reply: r.text, steps };
  } catch (e) {
    if (e instanceof SmtpError) { console.error(`SMTP fel i steg ${e.stage}: ${e.message} | klara steg: ${steps.join(", ")}`); throw e; }
    const msg = `Fel i steg ${stage} mot ${o.host}:${o.port} – ${scrub(errText(e))} (klara steg: ${steps.join(", ") || "inga"})`;
    console.error(`SMTP ${msg}`);
    throw new SmtpError(stage, msg);
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

const errText = (e: unknown) => String((e as Error)?.message ?? e);

function b64(s: string) {
  const by = new TextEncoder().encode(s); let o = "";
  for (let i = 0; i < by.length; i += 8192) o += String.fromCharCode(...by.subarray(i, i + 8192));
  return btoa(o);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: number;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`tidsgräns (${ms / 1000} s)`)), ms); }),
  ]);
}
