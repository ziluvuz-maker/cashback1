const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());

// Cookie Shopee Affiliate - cần refresh mỗi 2-4 tuần
const AFFILIATE_COOKIE = "_hjSessionUser_868286=eyJpZCI6IjhmOWU4NDUzLWNkMzctNTVmZS04ZjUwLTNjZTQ0MmYzNDg5MiIsImNyZWF0ZWQiOjE3MTk1Mzg0ODc2NzgsImV4aXN0aW5nIjp0cnVlfQ==; SPC_F=Z67MsuYNxTUq6IIJxfxaVhIpTTTnGwS4; language=vi; _ga=GA1.1.199623098.1719538486; csrftoken=wTEyllDzipuFKWO8mCiwb7cXShxdcXnJ; SPC_U=257576846; SPC_ST=SEs4TFpibFpBOWdSMWtRcGHUa7F+uOeGwjOTLhMXJ2NZX0WvtMyurQKVOvlVnFlVHkjDmKDRa4H06UnWKv0ErHrsPkolLNsUhcl0dxxbbF6p+QlrzTmbzTkkqq5ir536ffO8/jqs9/XuPf4VJNPSgrJsvsMk3p1ZcFo+euARJSt9duM/65ULL63AliaJtEZ1MvnDiZ1o/EUR1DE9Ss+utQ==.AEiapVOkhhrLxKVwaLohIe7Q3xFg117r4nXo6u0lbPh2; SPC_EC=NEFDVFFiTHBIRGU1VVc1Yh0yyZzgrHNhJMpferC73rQ5Kb7wpDiPHpm8ojWvS8sn8G0KGCw+eXIR5JLgqYI+ieaIDWEynqxeoCdOzZhfRyDPMnfBxs3k6EaaWZ+loYgHc3txE/dm1qXUjxDG/mRC/FMi6kQrBSW7WDGxUe0Mu7dhcZYJCZYsOocrYLndndDKSTkhpBbMLB1a4WJoH7Ut3Q==.ACyxxIilXuma2CikD16+shyQ/aROqWdq4rnWf5rfbQ3Q; _med=affiliates; ds=1993de10198d4b631930280a5b121e8b; shopee_webUnique_ccd=hmaRM%2FZ7McGttQr6we2qOA%3D%3D%7CfsfdDMmMGZa%2BX5fmx5RArqtZWC72dRNjf98i09%2BUtzI7y4V01e7tAX81hbm%2BYtm4YhAjRMdYhOhLkipn%7CyNExsEivcdHqm370%7C08%7C3";

const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9',
};

async function unshortenUrl(url) {
  try {
    const r = await axios.get(url, {
      maxRedirects: 0,
      validateStatus: s => s >= 200 && s < 400,
      headers: MOBILE_HEADERS,
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

function extractIds(url) {
  const cleanUrl = url.split('?')[0];
  let shopId = '', itemId = '';

  // Dạng: ten-sp-i.SHOPID.ITEMID
  const m1 = cleanUrl.match(/-i\.(\d+)\.(\d+)/i);
  if (m1) { shopId = m1[1]; itemId = m1[2]; }

  // Dạng: /product/SHOPID/ITEMID
  if (!shopId) {
    const m2 = cleanUrl.match(/shopee\.vn\/product\/(\d+)\/(\d+)/i);
    if (m2) { shopId = m2[1]; itemId = m2[2]; }
  }

  // Dạng: /username/SHOPID/ITEMID (mobile affiliate)
  if (!shopId) {
    const m3 = cleanUrl.match(/shopee\.vn\/[^/]+\/(\d{5,})\/(\d{5,})/i);
    if (m3) { shopId = m3[1]; itemId = m3[2]; }
  }

  return { shopId, itemId };
}

app.get('/resolve', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Thiếu URL' });

  let longUrl = targetUrl;
  let productTitle = 'SẢN PHẨM SHOPEE';
  let productImage = 'https://deo.shopeemobile.com/shopee/shopee-pcmall-live-sg/assets/icon_shopee_logo.png';
  let productPrice = 0;
  let commission = '';
  let commissionRate = '';

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

    // BƯỚC 2: BÓC IDs
    const { shopId, itemId } = extractIds(longUrl);

    // Fallback tên từ slug
    const cleanUrl = longUrl.split('?')[0];
    const slugMatch = cleanUrl.match(/shopee\.vn\/([^/]+)-i\.\d+\.\d+/i);
    if (slugMatch && slugMatch[1]) {
      try { productTitle = decodeURIComponent(slugMatch[1]).replace(/-/g, ' '); }
      catch (e) { productTitle = slugMatch[1].replace(/-/g, ' '); }
    }

    // BƯỚC 3: GỌI AFFILIATE API lấy tên + ảnh + hoa hồng thật
    if (itemId) {
      try {
        const affRes = await axios.get(
          `https://affiliate.shopee.vn/api/v3/offer/product?item_id=${itemId}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
              'Referer': 'https://affiliate.shopee.vn/',
              'Cookie': AFFILIATE_COOKIE
            },
            timeout: 10000
          }
        );

        const d = affRes.data;
        if (d && d.code === 0 && d.data) {
          const item = d.data.batch_item_for_item_card_full;
          if (item) {
            if (item.name) productTitle = item.name;
            if (item.image) {
              // Xác định prefix ảnh (vn-, sg-, cn-...)
              const prefix = item.image.startsWith('vn-') ? 'vn' :
                             item.image.startsWith('sg-') ? 'sg' :
                             item.image.startsWith('cn-') ? 'cn' : 'vn';
              productImage = `https://down-${prefix}.img.susercontent.com/file/${item.image}`;
            }
            if (item.price) productPrice = parseInt(item.price) / 100000;
          }
          if (d.data.commission) commission = d.data.commission;
          if (d.data.commission_rate && d.data.commission_rate.default_commission_rate) {
            commissionRate = d.data.commission_rate.default_commission_rate;
          }
        }
      } catch (e) {
        console.warn('Affiliate API lỗi:', e.message);
      }
    }

    res.json({
      longUrl,
      title: productTitle,
      image: productImage,
      price: productPrice,
      commission,
      commissionRate,
      shopId,
      itemId
    });

  } catch (err) {
    res.json({ longUrl, title: productTitle, image: productImage, price: 0, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SOI Server chạy tại cổng ${PORT}`));
