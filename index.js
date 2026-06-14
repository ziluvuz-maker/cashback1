const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
};

// Bóc meta tag từ HTML
function parseMeta(html) {
  const get = (pattern) => {
    const m = html.match(pattern);
    return m ? m[1].trim() : null;
  };
  return {
    title: get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
        || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
        || get(/<title>([^<]+)<\/title>/i),
    image: get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i),
    price: get(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i)
        || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']product:price:amount["']/i),
  };
}

app.get('/resolve', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Thiếu URL' });

  let longUrl = targetUrl;
  let title = 'SẢN PHẨM SHOPEE';
  let image = 'https://deo.shopeemobile.com/shopee/shopee-pcmall-live-sg/assets/icon_shopee_logo.png';
  let price = 0;

  try {
    // =============================================
    // BƯỚC 1: UNSHORTEN (chain redirect tối đa 5 lần)
    // =============================================
    let currentUrl = targetUrl;
    for (let i = 0; i < 5; i++) {
      if (!currentUrl.includes('s.shopee.vn') && !currentUrl.includes('shp.ee') && !currentUrl.includes('shopee.vn/an_redir')) break;
      try {
        const r = await axios.get(currentUrl, {
          maxRedirects: 0,
          validateStatus: s => s >= 200 && s < 400,
          headers: BROWSER_HEADERS,
          timeout: 5000,
        });
        if (r.status >= 300 && r.status < 400 && r.headers.location) {
          currentUrl = r.headers.location;
        } else break;
      } catch (e) {
        if (e.response && e.response.headers && e.response.headers.location) {
          currentUrl = e.response.headers.location;
        } else break;
      }
    }
    longUrl = currentUrl;

    // Bóc origin_link nếu có
    if (longUrl.includes('origin_link=')) {
      try {
        const u = new URL(longUrl);
        const origin = u.searchParams.get('origin_link');
        if (origin) longUrl = decodeURIComponent(origin);
      } catch (e) {}
    }

    // =============================================
    // BƯỚC 2: BÓC SHOPID + ITEMID
    // =============================================
    const cleanUrl = longUrl.split('?')[0];
    let shopId = '', itemId = '';

    // Dạng: ten-san-pham-i.SHOPID.ITEMID
    const m1 = cleanUrl.match(/-i\.(\d+)\.(\d+)/i);
    if (m1) { shopId = m1[1]; itemId = m1[2]; }

    // Dạng: shopee.vn/username/SHOPID/ITEMID
    if (!shopId) {
      const m2 = cleanUrl.match(/shopee\.vn\/[^/]+\/(\d{5,})\/(\d{5,})/i);
      if (m2) { shopId = m2[1]; itemId = m2[2]; }
    }

    // Dạng: shopee.vn/product/SHOPID/ITEMID
    if (!shopId) {
      const m3 = cleanUrl.match(/shopee\.vn\/product\/(\d+)\/(\d+)/i);
      if (m3) { shopId = m3[1]; itemId = m3[2]; }
    }

    // Fallback tên từ slug URL
    const slugMatch = cleanUrl.match(/shopee\.vn\/([^/]+)-i\.\d+\.\d+/i);
    if (slugMatch && slugMatch[1]) {
      try { title = decodeURIComponent(slugMatch[1]).replace(/-/g, ' '); }
      catch (e) { title = slugMatch[1].replace(/-/g, ' '); }
    }

    // =============================================
    // BƯỚC 3: SCRAPE META TAG (thử nhiều URL dạng chuẩn)
    // =============================================
    if (shopId && itemId) {
      const urlsToTry = [
        `https://shopee.vn/product/${shopId}/${itemId}`,
        `https://shopee.vn/-i.${shopId}.${itemId}`,
        cleanUrl,
      ];

      for (const pageUrl of urlsToTry) {
        try {
          const pageRes = await axios.get(pageUrl, {
            headers: BROWSER_HEADERS,
            timeout: 8000,
            maxRedirects: 5,
          });
          const meta = parseMeta(pageRes.data);
          if (meta.title && meta.title !== 'Shopee' && !meta.title.includes('Shopee Vietnam')) {
            title = meta.title;
            if (meta.image) image = meta.image;
            if (meta.price) price = parseFloat(meta.price);
            break;
          }
        } catch (e) {}
      }
    }

    res.json({ longUrl, title, image, price, shopId, itemId });

  } catch (err) {
    res.json({ longUrl, title, image, price, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SOI Server chạy tại cổng ${PORT}`));