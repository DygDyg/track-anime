const ids = [3422510, 3422511, 3237813];

async function checkCommentPage(id) {
  const res = await fetch(`https://shikimori.io/comments/${id}`, {
    headers: { "User-Agent": "TrackAnime/1.0" },
  });
  const html = await res.text();
  console.log(`comment page ${id}: status=${res.status} len=${html.length} has3422510=${html.includes("3422510")}`);
  const re = /data-attrs="\{&quot;id&quot;:(\d+)\}"[^>]*href="(https?:\/\/[^"]+user_images[^"]+)"/g;
  let m;
  const map = {};
  while ((m = re.exec(html)) !== null) map[m[1]] = m[2];
  console.log("  image map from page:", map);
}

async function checkForum(topicId, pages = 3) {
  const map = {};
  for (let page = 1; page <= pages; page += 1) {
    const origin = page === 1 ? "https://shikimori.one" : "https://shikimori.io";
    const res = await fetch(`${origin}/forum/${topicId}?page=${page}`, {
      headers: { "User-Agent": "TrackAnime/1.0" },
    });
    console.log(`forum page ${page} (${origin}): status=${res.status}`);
    if (!res.ok) break;
    const html = await res.text();
    if (!html.includes("b-comment")) break;
    const patterns = [
      /href="(https?:\/\/[^"]+\/system\/user_images[^"]+)"[^>]*data-attrs="\{&quot;id&quot;:(\d+)\}"/g,
      /data-attrs="\{&quot;id&quot;:(\d+)\}"[^>]*href="(https?:\/\/[^"]+\/system\/user_images[^"]+)"/g,
    ];
    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(html)) !== null) {
        if (pattern === patterns[0]) map[m[2]] = m[1];
        else map[m[1]] = m[2];
      }
    }
  }
  console.log("forum map size:", Object.keys(map).length, map);
}

await checkCommentPage(13422188);
await checkForum(569992);
