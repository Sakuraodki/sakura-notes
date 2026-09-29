// サイト全体の設定。ここを書き換えるとサイトに反映されます。
export default {
  title: 'SakuraNotes',
  // トップの見出し（\n で改行）
  catchcopy: '日々の気づきを、\n小さく残す。',
  description: '作ったもの、見たもの、引っかかったこと。日々の気づきを残すノートです。',
  author: 'Sakura',
  lang: 'ja',

  // GoatCounter のコード（https://○○○.goatcounter.com の ○○○ の部分）。
  // 空のままなら閲覧数の計測・表示はオフになります。
  goatcounter: 'sakuranotes',

  // コメント機能（Cloudflare Workers のコメント API）。どちらかが空ならコメント欄は出ません。
  comments: {
    // コメント API の URL（例: https://sakura-comments.○○○.workers.dev）
    api: '',
    // Cloudflare Turnstile のサイトキー（公開してよいほうのキー）
    turnstileSiteKey: '',
  },

  // ホームで最初に表示する件数（残りは「もっと見る」で表示）
  pageSize: 15,

  // アクセントカラー
  accent: '#D4561E',
};
