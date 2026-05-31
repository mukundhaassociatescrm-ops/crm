const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const formatMultiline = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');

const isSlugLikeTitle = (title, slug) => {
  const normalized = String(title || '').trim().toLowerCase();
  const slugNorm = String(slug || '').trim().toLowerCase();
  if (!normalized) return true;
  if (slugNorm && normalized === slugNorm) return true;
  if (/^template-\d+$/i.test(normalized)) return true;
  return false;
};

const buildPosterLandingHtml = (poster) => {
  const rawTitle = String(poster.title || '').trim();
  const displayTitle = isSlugLikeTitle(rawTitle, poster.slug) ? '' : escapeHtml(rawTitle);
  const whatsappLabel = displayTitle || 'your poster';
  const category = escapeHtml(poster.category);
  const shortDescription = poster.shortDescription ? formatMultiline(poster.shortDescription) : '';
  const imageUrl = escapeHtml(poster.imageUrl);
  const imageAlt = displayTitle || 'Mukundha Associates poster';
  const pageTitle = displayTitle || 'Mukundha Associates';
  const whatsappLink = 'https://wa.me/919363069948?text=' + encodeURIComponent(`Hi Mukundha Associates, I viewed "${whatsappLabel}".`);
  const callLink = 'tel:+918508169948';
  const callLink2 = 'tel:+916379680872';

  const categoryBlock = category
    ? `<p class="hero-category">${category}</p>`
    : '';
  const titleBlock = displayTitle
    ? `<h1 class="hero-title">${displayTitle}</h1>`
    : '';
  const leadBlock = shortDescription
    ? `<p class="hero-lead">${shortDescription}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle} | Mukundha Associates</title>
  <meta name="description" content="${escapeHtml(poster.shortDescription || rawTitle || 'Mukundha Associates')}">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      overflow-x: hidden;
      overflow-y: auto;
    }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: linear-gradient(165deg, #ecfdf5 0%, #f8fafc 28%, #ffffff 72%);
      color: #0f172a;
      line-height: 1.5;
      padding: 10px 12px 96px;
    }
    .poster-container {
      width: 95%;
      max-width: 1600px;
      margin: 0 auto;
    }
    .landing-top {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 4px 0 10px;
    }
    .brand-name {
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0f766e;
    }
    .hero { text-align: center; padding: 0 0 20px; }
    .hero-category {
      display: inline-block;
      margin: 0 0 8px;
      padding: 4px 12px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.1);
      color: #0f766e;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .hero-title {
      margin: 0 0 14px;
      color: #0f172a;
      font-size: clamp(1.25rem, 4.5vw, 2rem);
      line-height: 1.25;
      font-weight: 800;
      padding: 0 8px;
    }
    .hero-poster {
      width: 100%;
      margin: 0 auto 16px;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 4px 6px rgba(15, 23, 42, 0.04), 0 20px 40px rgba(15, 23, 42, 0.1);
    }
    .poster-image {
      display: block;
      width: 100%;
      max-width: 1400px;
      height: auto;
      margin: 0 auto;
      border-radius: 12px;
    }
    .hero-lead {
      margin: 0 auto;
      max-width: 640px;
      padding: 0 12px;
      color: #475569;
      font-size: clamp(0.9rem, 2.8vw, 1.05rem);
      line-height: 1.55;
    }
    .cta-panel {
      width: min(100%, 560px);
      margin: 0 auto;
      padding: 20px 18px 22px;
      border-radius: 16px;
      background: #fff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
      text-align: center;
    }
    .cta-panel h2 {
      margin: 0 0 14px;
      font-size: 1.2rem;
      font-weight: 800;
      color: #0f172a;
    }
    .contact-list {
      list-style: none;
      margin: 0 0 18px;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .contact-list li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 0.98rem;
      color: #334155;
    }
    .contact-label { font-weight: 700; color: #0f172a; }
    .contact-value {
      color: #0f766e;
      font-weight: 700;
      text-decoration: none;
    }
    .contact-value:hover { text-decoration: underline; }
    .cta-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 48px;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 0.95rem;
      font-weight: 800;
      text-decoration: none;
      color: #fff;
    }
    .btn-whatsapp {
      background: #25d366;
      box-shadow: 0 8px 20px rgba(37, 211, 102, 0.35);
    }
    .btn-call {
      background: #0f766e;
      box-shadow: 0 8px 20px rgba(15, 118, 110, 0.28);
    }
    .cta-address {
      margin: 0;
      font-size: 0.75rem;
      line-height: 1.5;
      color: #64748b;
    }
    .fab-whatsapp {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #25d366;
      color: #fff;
      text-decoration: none;
      box-shadow: 0 10px 28px rgba(37, 211, 102, 0.45);
    }
    .fab-whatsapp svg { width: 28px; height: 28px; fill: currentColor; }
    @media (max-width: 640px) {
      body { padding: 8px 10px 88px; }
      .poster-container { width: 100%; }
      .poster-image, .hero-poster { width: 100%; max-width: none; border-radius: 10px; }
      .cta-actions { grid-template-columns: 1fr; }
      .btn { width: 100%; min-height: 52px; }
      .fab-whatsapp { right: 12px; bottom: 12px; width: 52px; height: 52px; }
      .fab-whatsapp svg { width: 26px; height: 26px; }
    }
  </style>
</head>
<body>
  <main class="poster-container">
    <header class="landing-top">
      <span class="brand-name">Mukundha Associates</span>
    </header>

    <section class="hero">
      ${categoryBlock}
      ${titleBlock}
      <div class="hero-poster">
        <img class="poster-image" src="${imageUrl}" alt="${imageAlt}" loading="eager">
      </div>
      ${leadBlock}
    </section>

    <section class="cta-panel" aria-labelledby="cta-heading">
      <h2 id="cta-heading">Need assistance?</h2>
      <ul class="contact-list">
        <li>
          <span class="contact-label">WhatsApp:</span>
          <a class="contact-value" href="${whatsappLink}" target="_blank" rel="noopener noreferrer">93630 69948</a>
        </li>
        <li>
          <span class="contact-label">Call:</span>
          <a class="contact-value" href="${callLink}">85081 69948</a>
        </li>
        <li>
          <span class="contact-label">Call:</span>
          <a class="contact-value" href="${callLink2}">63796 80872</a>
        </li>
      </ul>
      <div class="cta-actions">
        <a class="btn btn-whatsapp" href="${whatsappLink}" target="_blank" rel="noopener noreferrer">WhatsApp Now</a>
        <a class="btn btn-call" href="${callLink}">Call Now</a>
      </div>
      <p class="cta-address">
        TF7, C Block, 3rd Floor, Ramani's Jewel Manor Apartment, Samy Iyer New Street, Coimbatore - 641001
      </p>
    </section>
  </main>

  <a class="fab-whatsapp" href="${whatsappLink}" target="_blank" rel="noopener noreferrer" title="Chat on WhatsApp" aria-label="Chat on WhatsApp">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  </a>
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
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, sans-serif;
      text-align: center;
      padding: 48px 16px;
      color: #475569;
      background: linear-gradient(165deg, #ecfdf5 0%, #f8fafc 50%, #fff 100%);
      min-height: 100vh;
    }
    h1 { color: #0f172a; font-size: 1.5rem; }
    .brand { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #0f766e; margin-bottom: 16px; }
  </style>
</head>
<body>
  <p class="brand">Mukundha Associates</p>
  <h1>Poster not found</h1>
  <p>This link may be inactive or expired.</p>
</body>
</html>`;

module.exports = {
  buildPosterLandingHtml,
  buildPosterNotFoundHtml,
  escapeHtml,
  isSlugLikeTitle,
};
