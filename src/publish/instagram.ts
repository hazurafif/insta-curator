import { readFileSync } from 'node:fs';

const ig = {
  userId: process.env.IG_USER_ID ?? '',
  token: process.env.IG_ACCESS_TOKEN ?? '',
  version: process.env.IG_GRAPH_VERSION ?? 'v25.0',
  imageHost: (process.env.IMAGE_HOST ?? 'catbox').toLowerCase(),
  imgbbKey: process.env.IMGBB_API_KEY ?? '',
  dryRun: (process.env.PUBLISH_DRY_RUN ?? '1') !== '0',
};

export interface PublishResult {
  ok: boolean;
  dryRun: boolean;
  mediaId?: string;
  imageUrl?: string;
  error?: string;
}

/** Upload cover ke host publik (IG Graph API butuh image_url publik). */
async function uploadToImageHost(filePath: string): Promise<string> {
  const buf = readFileSync(filePath);

  if (ig.imageHost === 'imgbb') {
    if (!ig.imgbbKey) throw new Error('IMGBB_API_KEY belum diisi di .env');
    const form = new FormData();
    form.append('image', buf.toString('base64'));
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${ig.imgbbKey}`, {
      method: 'POST',
      body: form,
    });
    const data = (await res.json()) as { data?: { url?: string } };
    if (!data?.data?.url) {
      throw new Error(`imgbb gagal: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return data.data.url;
  }

  // Default: catbox.moe (tanpa API key).
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([buf], { type: 'image/png' }), 'cover.png');
  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
  });
  const text = (await res.text()).trim();
  if (!text.startsWith('http')) throw new Error(`catbox gagal: ${text}`);
  return text;
}

/** Info akun IG (untuk cek token valid). */
export async function getIgAccount(): Promise<{
  ok: boolean;
  dryRun: boolean;
  username?: string;
  error?: string;
}> {
  if (ig.dryRun) return { ok: true, dryRun: true };
  if (!ig.userId || !ig.token) {
    return { ok: false, dryRun: false, error: 'IG_USER_ID / IG_ACCESS_TOKEN belum diisi di .env' };
  }
  try {
    const params = new URLSearchParams({
      fields: 'username,account_type',
      access_token: ig.token,
    });
    const res = await fetch(
      `https://graph.facebook.com/${ig.version}/${ig.userId}?${params}`,
    );
    const data = (await res.json()) as { username?: string; error?: { message?: string } };
    if (!res.ok || !data.username) {
      return {
        ok: false,
        dryRun: false,
        error: data.error?.message ?? 'token tidak valid',
      };
    }
    return { ok: true, dryRun: false, username: data.username };
  } catch (e) {
    return { ok: false, dryRun: false, error: (e as Error).message };
  }
}

/**
 * Posting satu gambar + caption ke Instagram.
 * Flow: upload ke host publik → buat media container → media_publish.
 */
export async function publishImage(
  imagePath: string,
  caption: string,
): Promise<PublishResult> {
  try {
    if (caption.length > 2200) caption = caption.slice(0, 2190) + '…';

    if (ig.dryRun) {
      return {
        ok: true,
        dryRun: true,
        imageUrl: '(simulasi)',
        mediaId: 'dry-run',
      };
    }

    if (!ig.userId || !ig.token) {
      throw new Error('IG_USER_ID / IG_ACCESS_TOKEN belum diisi di .env');
    }

    const imageUrl = await uploadToImageHost(imagePath);

    // 1) Buat media container.
    const createParams = new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: ig.token,
    });
    const createRes = await fetch(
      `https://graph.facebook.com/${ig.version}/${ig.userId}/media?${createParams}`,
      { method: 'POST' },
    );
    const createData = (await createRes.json()) as {
      id?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !createData.id) {
      throw new Error(
        `buat container gagal: ${createData.error?.message ?? JSON.stringify(createData)}`,
      );
    }

    // 2) Publish container.
    const pubParams = new URLSearchParams({
      creation_id: createData.id,
      access_token: ig.token,
    });
    const pubRes = await fetch(
      `https://graph.facebook.com/${ig.version}/${ig.userId}/media_publish?${pubParams}`,
      { method: 'POST' },
    );
    const pubData = (await pubRes.json()) as {
      id?: string;
      error?: { message?: string };
    };
    if (!pubRes.ok || !pubData.id) {
      throw new Error(
        `publish gagal: ${pubData.error?.message ?? JSON.stringify(pubData)}`,
      );
    }

    return { ok: true, dryRun: false, mediaId: pubData.id, imageUrl };
  } catch (e) {
    return { ok: false, dryRun: ig.dryRun, error: (e as Error).message };
  }
}
