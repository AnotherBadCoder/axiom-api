import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false, // Required for file uploads
    externalResolver: true,
  },
};

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers to allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const form = formidable({ multiples: true });

  form.parse(req, async (err: any, fields: formidable.Fields, files: formidable.Files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Form parsing failed' });
    }

    const name = fields.fullName?.[0] || fields.name?.[0] || 'No name';
    const email = fields.email?.[0] || 'No email';
    const phone = fields.phone?.[0] || 'No phone';
    const message = (fields.queryDescription?.[0] || fields.message?.[0] || '').replace(/\n/g, '<br/>');

    const carMake = fields.carMake?.[0];
    const carModel = fields.carModel?.[0];
    const carReg = fields.carReg?.[0];
    const isQuote = carMake || carModel || carReg;

    // Handle file attachments
    const attachments =
      files.images instanceof Array
        ? await Promise.all(
            files.images.map(async (file: formidable.File) => ({
              filename: file.originalFilename || 'upload',
              content: fs.readFileSync(file.filepath),
            }))
          )
        : [];

    const subject = isQuote
      ? `New Quote Request from ${name}`
      : `New Contact Form Submission from ${name}`;

    const html = isQuote
      ? `
        <h2>New Quote Request from Axiom Website</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Car:</strong> ${carMake ?? 'Unknown'} ${carModel ?? 'Unknown'} (${carReg ?? 'Unknown'})</p>
        <p><strong>Message:</strong><br/>${message}</p>
      `
      : `
        <h2>New Contact Form Submission from Axiom Website</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Message:</strong><br/>${message}</p>
      `;

    const { error } = await resend.emails.send({
      from: isQuote ? 'Quote Form <no-reply@goburley.com>' : 'Contact Form <no-reply@goburley.com>',
      to: ['george@goburley.com'],
      subject,
      replyTo: email,
      html,
      attachments,
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ success: false, error: 'Failed to send email' });
    }

    return res.status(200).json({ success: true });
  });
}
