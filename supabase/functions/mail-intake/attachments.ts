import PostalMime from "npm:postal-mime@2.7.3";

/** MIME decoding only: no HTML-to-text, text-to-HTML or CID image rewriting. */
export async function parseMailAttachments(source: Uint8Array) {
  const mail = await PostalMime.parse(source);
  return {
    subject: mail.subject,
    attachments: mail.attachments.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.mimeType,
      content: attachment.content,
    })),
  };
}