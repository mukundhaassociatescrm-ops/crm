const Poster = require('../models/Poster');
const { POSTER_CATEGORIES } = require('../models/Poster');
const { slugifyText } = require('../utils/slugify');

const getPublicBaseUrl = (req) => {
  if (process.env.PUBLIC_SITE_URL) {
    return String(process.env.PUBLIC_SITE_URL).replace(/\/$/, '');
  }
  if (process.env.PUBLIC_BASE_URL) {
    return String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  }
  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const isLocalHost = /localhost|127\.0\.0\.1/.test(host);
  const protocol = forwardedProto || (isLocalHost ? 'http' : 'https');
  return `${protocol}://${host}`;
};

const getApiBaseUrl = (req) => {
  if (process.env.PUBLIC_BASE_URL) {
    return String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  }
  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const isLocalHost = /localhost|127\.0\.0\.1/.test(host);
  const protocol = forwardedProto || (isLocalHost ? 'http' : 'https');
  return `${protocol}://${host}`;
};

const buildLandingPath = (slug) => `/posters/${encodeURIComponent(slug)}`;

const buildLandingUrl = (req, slug) => `${getPublicBaseUrl(req)}${buildLandingPath(slug)}`;

const toPosterView = (doc, req) => {
  const item = doc.toObject ? doc.toObject() : doc;
  return {
    ...item,
    landingPath: buildLandingPath(item.slug),
    landingUrl: buildLandingUrl(req, item.slug),
  };
};

const ensureUniqueSlug = async (baseSlug, excludeId = null) => {
  let slug = baseSlug || 'poster';
  let suffix = 0;
  while (true) {
    const query = { slug };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    const existing = await Poster.findOne(query).select('_id').lean();
    if (!existing) {
      return slug;
    }
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
};

exports.getCategories = (_req, res) => {
  res.json({ success: true, data: POSTER_CATEGORIES });
};

exports.listPosters = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || '').trim();
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '25'), 10) || 25));

    const filter = {};
    if (category) {
      filter.category = category;
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { slug: rx }, { shortDescription: rx }];
    }

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      Poster.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Poster.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: rows.map((row) => toPosterView(row, req)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.listActivePosters = async (req, res, next) => {
  try {
    const rows = await Poster.find({ isActive: true }).sort({ title: 1 }).lean();
    res.json({
      success: true,
      data: rows.map((row) => toPosterView(row, req)),
    });
  } catch (error) {
    next(error);
  }
};

exports.getPosterById = async (req, res, next) => {
  try {
    const poster = await Poster.findById(req.params.id);
    if (!poster) {
      return res.status(404).json({ success: false, message: 'Poster not found.' });
    }
    return res.json({ success: true, data: toPosterView(poster, req) });
  } catch (error) {
    next(error);
  }
};

exports.getPublicPosterBySlug = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug) {
      return res.status(400).json({ success: false, message: 'slug is required.' });
    }

    const poster = await Poster.findOneAndUpdate(
      { slug, isActive: true },
      { $inc: { viewCount: 1 } },
      { new: true },
    ).lean();

    if (!poster) {
      return res.status(404).json({ success: false, message: 'Poster not found or inactive.' });
    }

    return res.json({
      success: true,
      data: {
        title: poster.title,
        slug: poster.slug,
        imageUrl: poster.imageUrl,
        category: poster.category,
        shortDescription: poster.shortDescription || '',
        content: poster.content || '',
        viewCount: poster.viewCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.createPoster = async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Poster image is required.' });
    }

    const baseSlug = slugifyText(req.body.slug || title);
    const slug = await ensureUniqueSlug(baseSlug);
    const baseUrl = getApiBaseUrl(req);
    const imageUrl = `${baseUrl}/uploads/posters/${encodeURIComponent(req.file.filename)}`;

    const poster = await Poster.create({
      title,
      slug,
      imageUrl,
      imageFilename: req.file.originalname || req.file.filename,
      category: POSTER_CATEGORIES.includes(req.body.category) ? req.body.category : 'Other',
      shortDescription: String(req.body.shortDescription || '').trim(),
      content: String(req.body.content || '').trim(),
      isActive: String(req.body.isActive || 'true').toLowerCase() !== 'false',
    });

    return res.status(201).json({ success: true, data: toPosterView(poster, req) });
  } catch (error) {
    next(error);
  }
};

exports.updatePoster = async (req, res, next) => {
  try {
    const poster = await Poster.findById(req.params.id);
    if (!poster) {
      return res.status(404).json({ success: false, message: 'Poster not found.' });
    }

    const title = String(req.body.title || poster.title).trim();
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }

    let slug = poster.slug;
    if (req.body.slug) {
      const requested = slugifyText(req.body.slug);
      slug = await ensureUniqueSlug(requested || slugifyText(title), poster._id);
    } else if (title !== poster.title) {
      slug = await ensureUniqueSlug(slugifyText(title), poster._id);
    }

    poster.title = title;
    poster.slug = slug;
    poster.category = POSTER_CATEGORIES.includes(req.body.category) ? req.body.category : poster.category;
    poster.shortDescription = String(req.body.shortDescription ?? poster.shortDescription).trim();
    poster.content = String(req.body.content ?? poster.content).trim();

    if (req.body.isActive !== undefined) {
      poster.isActive = String(req.body.isActive).toLowerCase() !== 'false';
    }

    if (req.file) {
      const baseUrl = getApiBaseUrl(req);
      poster.imageUrl = `${baseUrl}/uploads/posters/${encodeURIComponent(req.file.filename)}`;
      poster.imageFilename = req.file.originalname || req.file.filename;
    }

    await poster.save();
    return res.json({ success: true, data: toPosterView(poster, req) });
  } catch (error) {
    next(error);
  }
};

exports.setPosterStatus = async (req, res, next) => {
  try {
    const isActive = Boolean(req.body.isActive);
    const poster = await Poster.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive } },
      { new: true },
    );
    if (!poster) {
      return res.status(404).json({ success: false, message: 'Poster not found.' });
    }
    return res.json({ success: true, data: toPosterView(poster, req) });
  } catch (error) {
    next(error);
  }
};

exports.deletePoster = async (req, res, next) => {
  try {
    const poster = await Poster.findByIdAndDelete(req.params.id);
    if (!poster) {
      return res.status(404).json({ success: false, message: 'Poster not found.' });
    }
    return res.json({ success: true, message: 'Poster deleted.' });
  } catch (error) {
    next(error);
  }
};
