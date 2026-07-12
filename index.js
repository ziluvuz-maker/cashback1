const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());

const SHOPEE_COOKIE = "_hjSessionUser_868286=eyJpZCI6IjhmOWU4NDUzLWNkMzctNTVmZS04ZjUwLTNjZTQ0MmYzNDg5MiIsImNyZWF0ZWQiOjE3MTk1Mzg0ODc2NzgsImV4aXN0aW5nIjp0cnVlfQ==; SPC_F=Z67MsuYNxTUq6IIJxfxaVhIpTTTnGwS4; language=vi; _ga=GA1.1.199623098.1719538486; csrftoken=wTEyllDzipuFKWO8mCiwb7cXShxdcXnJ; SPC_U=257576846; SPC_ST=SEs4TFpibFpBOWdSMWtRcGHUa7F+uOeGwjOTLhMXJ2NZX0WvtMyurQKVOvlVnFlVHkjDmKDRa4H06UnWKv0ErHrsPkolLNsUhcl0dxxbbF6p+QlrzTmbzTkkqq5ir536ffO8/jqs9/XuPf4VJNPSgrJsvsMk3p1ZcFo+euARJSt9duM/65ULL63AliaJtEZ1MvnDiZ1o/EUR1DE9Ss+utQ==.AEiapVOkhhrLxKVwaLohIe7Q3xFg117r4nXo6u0lbPh2; SPC_EC=NEFDVFFiTHBIRGU1VVc1Yh0yyZzgrHNhJMpferC73rQ5Kb7wpDiPHpm8ojWvS8sn8G0KGCw+eXIR5JLgqYI+ieaIDWEynqxeoCdOzZhfRyDPMnfBxs3k6EaaWZ+loYgHc3txE/dm1qXUjxDG/mRC/FMi6kQrBSW7WDGxUe0Mu7dhcZYJCZYsOocrYLndndDKSTkhpBbMLB1a4WJoH7Ut3Q==.ACyxxIilXuma2CikD16+shyQ/aROqWdq4rnWf5rfbQ3Q; _med=affiliates; ds=1993de10198d4b631930280a5b121e8b";

const BROWSER_HEADERS_MOBILE = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9',
};

const BROWSER_HEADERS_API = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'vi-VN,vi;q=0.9',
  'Referer': 'https://shopee.vn/',
  'Cookie': SHOPEE_COOKIE
};

async function unshortenUrl(url) {
  // Thử follow redirect trực tiếp — Render IP khác Cloudflare, có thể không bị block
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
    // BƯỚC 1: UNSHORTEN — follow redirect trực tiếp từ Render server
    if (longUrl.includes('s.shopee.vn') || longUrl.includes('shp.ee')) {
      const resolved = await unshortenUrl(longUrl);
      if (resolved !== longUrl) longUrl = resolved;
    }

    // Bóc origin_link nếu có
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

    // BƯỚC 3: GỌI API item_info với cookie
    if (shopId && itemId) {
      try {
        const apiRes = await axios.get(
          `https://shopee.vn/api/v1/opaanlp/item_info?item_id=${itemId}&shop_id=${shopId}`,
          { headers: BROWSER_HEADERS_API, timeout: 8000 }
        );

        const data = apiRes.data;
        if (data && data.error === 0 && data.item_card && data.item_card.item_cards && data.item_card.item_cards.length > 0) {
          const asset = data.item_card.item_cards[0].item_card_displayed_asset;
          if (asset.name) productTitle = asset.name;
          if (asset.image) productImage = `https://down-vn.img.susercontent.com/file/${asset.image}`;
          if (asset.display_price && asset.display_price.price) {
            productPrice = asset.display_price.price / 100000;
          }
        }
      } catch (e) {
        console.warn('item_info lỗi:', e.message);
      }
    }

    res.json({ longUrl, title: productTitle, image: productImage, price: productPrice, shopId, itemId });

  } catch (err) {
    res.json({ longUrl, title: productTitle, image: productImage, price: 0, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SOI Server chạy tại cổng ${PORT}`));
