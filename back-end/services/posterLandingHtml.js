const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const formatMultiline = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');

const buildPosterLandingHtml = (poster, options = {}) => {
  const siteUrl = String(options.siteUrl || 'https://mukundhaassociates.com').replace(/\/$/, '');
  const title = escapeHtml(poster.title);
  const category = escapeHtml(poster.category);
  const shortDescription = formatMultiline(poster.shortDescription);
  const content = formatMultiline(poster.content);
  const imageUrl = escapeHtml(poster.imageUrl);
  const whatsappLink = 'https://wa.me/919363069948?text=' + encodeURIComponent(`Hi Mukundha Associates, I viewed "${poster.title}".`);
  const callLink = 'tel:+918508169948';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Mukundha Associates</title>
  <meta name="description" content="${escapeHtml(poster.shortDescription || poster.title)}">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: linear-gradient(180deg, #f0fdfa 0%, #f8fafc 40%, #fff 100%);
      color: #0f172a;
      line-height: 1.5;
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
    .card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 24px 20px 28px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
    }
    .brand {
      text-align: center;
      margin-bottom: 16px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #0f766e;
    }
    h1 { margin: 0 0 8px; text-align: center; font-size: clamp(22px, 5vw, 30px); }
    .category {
      display: block;
      width: fit-content;
      margin: 0 auto 18px;
      padding: 4px 12px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #0f766e;
      font-size: 12px;
      font-weight: 600;
    }
    .poster-img {
      width: 100%;
      border-radius: 14px;
      display: block;
      margin-bottom: 18px;
      background: #f1f5f9;
    }
    .short { font-size: 16px; color: #334155; margin: 0 0 16px; }
    .content { font-size: 15px; color: #475569; margin: 0 0 20px; }
    .contact {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 20px;
      font-size: 14px;
      color: #334155;
    }
    .contact h2 { margin: 0 0 10px; font-size: 16px; }
    .cta { display: flex; flex-wrap: wrap; gap: 12px; }
    .btn {
      flex: 1;
      min-width: 160px;
      text-align: center;
      padding: 14px 18px;
      border-radius: 12px;
      font-weight: 700;
      text-decoration: none;
      font-size: 15px;
      color: #fff;
    }
    .btn-wa { background: #25d366; }
    .btn-call { background: #0f766e; }
    @media (max-width: 480px) { .cta { flex-direction: column; } .btn { width: 100%; } }
  </style>
</head>
<body>
  <div class="wrap">
    <article class="card">
      <p class="brand">Mukundha Associates</p>
      <h1>${title}</h1>
      <span class="category">${category}</span>
      <img class="poster-img" src="${imageUrl}" alt="${title}">
      ${shortDescription ? `<p class="short">${shortDescription}</p>` : ''}
      ${content ? `<div class="content">${content}</div>` : ''}
      <section class="contact">
        <h2>Contact Details</h2>
        <p><strong>WhatsApp:</strong> 9363069948</p>
        <p><strong>Call:</strong> 8508169948, 6379680872</p>
        <p><strong>Address:</strong> TF7, C Block, 3rd Floor, Ramani's Jewel Manor Apartment, Samy Iyer New Street, Coimbatore - 641001</p>
      </section>
      <div class="cta">
        <a class="btn btn-wa" href="${whatsappLink}" target="_blank" rel="noopener">Chat on WhatsApp</a>
        <a class="btn btn-call" href="${callLink}">Call Now</a>
      </div>
    </article>
  </div>
</body>
</html>`;
};

const buildPosterNotFoundHtml = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Poster not found | Mukundha Associates</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 48px 16px; color: #475569; }
    h1 { color: #0f172a; }
  </style>
</head>
<body>
  <h1>Poster not found</h1>
  <p>This link may be inactive or expired.</p>
  <p><a href="https://mukundhaassociates.com">mukundhaassociates.com</a></p>
</body>
</html>`;

module.exports = {
  buildPosterLandingHtml,
  buildPosterNotFoundHtml,
  escapeHtml,
};
