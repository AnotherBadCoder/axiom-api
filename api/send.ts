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

    console.log('Parsed form fields:', fields);
    console.log('Parsed form files:', files);
    // Normalize fields to strings
    const nameRaw = fields.fullName ?? fields.name ?? 'No name';
    const phoneRaw = fields.phone ?? 'No phone';
    const messageRaw = fields.queryDescription ?? fields.message ?? '';

    const name = Array.isArray(nameRaw) ? nameRaw[0] : nameRaw;
    const phone = Array.isArray(phoneRaw) ? phoneRaw[0] : phoneRaw;
    const message = (Array.isArray(messageRaw) ? messageRaw[0] : messageRaw).replace(/\n/g, '<br/>');

    // Normalize and validate email
    let emailRaw = fields.email ?? 'No email';
    let email = '';
    if (Array.isArray(emailRaw)) {
      email = emailRaw[0];
    } else if (typeof emailRaw === 'string') {
      email = emailRaw;
    }
    email = email.trim();

    const isValidEmail = email && /\S+@\S+\.\S+/.test(email);

    // Normalize car fields
    const carMakeRaw = fields.carMake;
    const carModelRaw = fields.carModel;
    const carRegRaw = fields.carReg;

    const carMake = Array.isArray(carMakeRaw) ? carMakeRaw[0] : carMakeRaw;
    const carModel = Array.isArray(carModelRaw) ? carModelRaw[0] : carModelRaw;
    const carReg = Array.isArray(carRegRaw) ? carRegRaw[0] : carRegRaw;

    const isQuote = carMake || carModel || carReg;

    // Handle file attachments (single or multiple)
    const attachments: {
      filename: string;
      content: Buffer;
      contentType: string;
    }[] = [];

    const uploaded = files.images;

    if (Array.isArray(uploaded)) {
      for (const file of uploaded) {
        const f = file as formidable.File;
        console.log('Processing uploaded file:', {
          name: f.originalFilename,
          path: f.filepath,
          mimetype: f.mimetype,
        });

        attachments.push({
          filename: f.originalFilename || 'upload',
          content: fs.readFileSync(f.filepath),
          contentType: f.mimetype || 'application/octet-stream',
        });
      }
    } else if (uploaded) {
      const f = uploaded as formidable.File;
      console.log('Processing single uploaded file:', {
        name: f.originalFilename,
        path: f.filepath,
        mimetype: f.mimetype,
      });

      attachments.push({
        filename: f.originalFilename || 'upload',
        content: fs.readFileSync(f.filepath),
        contentType: f.mimetype || 'application/octet-stream',
      });
    }

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

    try {
      const sendOptions: any = {
        from: isQuote ? 'New Quote Request <no-reply@axiomrepair.co.uk>' : 'Contact Form Request <no-reply@axiomrepair.co.uk>',
        to: ['website@axiomrepair.co.uk'],
        subject,
        html,
        attachments,
      };

      if (isValidEmail) {
        sendOptions.replyTo = email;
      }

      const { error } = await resend.emails.send(sendOptions);

      console.log('Final email payload:', {
        to: sendOptions.to,
        from: sendOptions.from,
        subject: sendOptions.subject,
        html: sendOptions.html,
        attachments: attachments.map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.content.length,
        })),
      });


      if (error) {
        console.error('Resend error:', error);
        return res.status(500).json({ success: false, error: 'Failed to send email' });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Unexpected error:', error);
      return res.status(500).json({ success: false, error: 'Unexpected error occurred' });
    }
  });
}
