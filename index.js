const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());

const BROWSER_HEADERS_MOBILE = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9',
};

const BROWSER_HEADERS_DESKTOP = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
  'Referer': 'https://shopee.vn/',
};

function parseMeta(html) {
  const get = (pattern) => {
    const m = html.match(pattern);
    return m ? m[1].trim() : null;
  };
  return {
    title: get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
        || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i),
    image: get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i),
    price: get(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i)
        || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']product:price:amount["']/i),
  };
}

async function unshortenUrl(url) {
  try {
    const r = await axios.get(url, {
      maxRedirects: 0,
      validateStatus: s => s >= 200 && s < 400,
      headers: BROWSER_HEADERS_MOBILE,
      timeout: 8000
    });
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      return r.headers.location;
    }
  } catch (e) {
    if (e.response && e.response.headers && e.response.headers.location) {
      return e.response.headers.location;
    }
  }
  return url;
}

app.get('/resolve', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Thiếu URL' });

  let longUrl = targetUrl;
  let productTitle = 'SẢN PHẨM SHOPEE';
  let productImage = 'https://deo.shopeemobile.com/shopee/shopee-pcmall-live-sg/assets/icon_shopee_logo.png';
  let productPrice = 0;

  try {
    // BƯỚC 1: UNSHORTEN
    if (longUrl.includes('s.shopee.vn') || longUrl.includes('shp.ee')) {
      const resolved = await unshortenUrl(longUrl);
      if (resolved !== longUrl) longUrl = resolved;
    }

    if (longUrl.includes('origin_link=')) {
      try {
        const u = new URL(longUrl);
        const origin = u.searchParams.get('origin_link');
        if (origin) longUrl = decodeURIComponent(origin);
      } catch (e) {}
    }

    const cleanUrl = longUrl.split('?')[0];

    // BƯỚC 2: BÓC SHOPID + ITEMID
    let shopId = '', itemId = '';

    const m1 = cleanUrl.match(/-i\.(\d+)\.(\d+)/i);
    if (m1) { shopId = m1[1]; itemId = m1[2]; }

    if (!shopId) {
      const m2 = cleanUrl.match(/shopee\.vn\/product\/(\d+)\/(\d+)/i);
      if (m2) { shopId = m2[1]; itemId = m2[2]; }
    }

    if (!shopId) {
      const m3 = cleanUrl.match(/shopee\.vn\/[^/]+\/(\d{5,})\/(\d{5,})/i);
      if (m3) { shopId = m3[1]; itemId = m3[2]; }
    }

    // Fallback tên từ slug
    const slugMatch = cleanUrl.match(/shopee\.vn\/([^/]+)-i\.\d+\.\d+/i);
    if (slugMatch && slugMatch[1]) {
      try { productTitle = decodeURIComponent(slugMatch[1]).replace(/-/g, ' '); }
      catch (e) { productTitle = slugMatch[1].replace(/-/g, ' '); }
    }

    // BƯỚC 3: SCRAPE META TAG từ trang sản phẩm (không cần cookie)
    if (shopId && itemId) {
      const urlsToTry = [
        `https://shopee.vn/product/${shopId}/${itemId}`,
        `https://shopee.vn/-i.${shopId}.${itemId}`,
        cleanUrl
      ];

      for (const pageUrl of urlsToTry) {
        try {
          const pageRes = await axios.get(pageUrl, {
            headers: BROWSER_HEADERS_DESKTOP,
            timeout: 10000,
            maxRedirects: 5,
          });

          const meta = parseMeta(pageRes.data);

          if (meta.title && meta.title !== 'Shopee' && !meta.title.toLowerCase().includes('shopee việt nam')) {
            productTitle = meta.title
              .replace(' | Shopee Việt Nam', '')
              .replace(' | Shopee Vietnam', '')
              .trim();
            if (meta.image) productImage = meta.image;
            if (meta.price) productPrice = parseFloat(meta.price);
            break;
          }
        } catch (e) {
          console.warn(`Scrape ${pageUrl} lỗi:`, e.message);
        }
      }
    }

    res.json({ longUrl, title: productTitle, image: productImage, price: productPrice, shopId, itemId });

  } catch (err) {
    res.json({ longUrl, title: productTitle, image: productImage, price: 0, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SOI Server chạy tại cổng ${PORT}`));
