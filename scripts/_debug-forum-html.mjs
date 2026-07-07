const res = await fetch("https://shikimori.one/forum/569992?page=1", {
  headers: { "User-Agent": "TrackAnime/1.0" },
});
const html = await res.text();
console.log("len", html.length);
console.log("b-image", html.includes("b-image"));
console.log("data-attrs", html.includes("data-attrs"));
console.log("user_images_h", html.includes("user_images_h"));
const samples = [...html.matchAll(/class=\"b-comment[^\"]*\"[^>]*data-id=\"(\d+)\"/g)].slice(0, 3);
console.log("comments", samples.map((m) => m[1]));
const imgSamples = [...html.matchAll(/<img[^>]+>/g)].slice(0, 5);
console.log("img tags", imgSamples.map((m) => m[0].slice(0, 120)));
