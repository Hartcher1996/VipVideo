/**
 * 站点全局配置文件 (ESM)
 *
 * 部署到 Cloudflare Pages 后，前后端共享同一份：
 *   - Functions 后端：import from '../../config/site.config.mjs'
 *   - 前端         ：通过 GET /api/site/config 读取
 *
 * 修改后重新部署即可生效。
 */

export default {
  siteName: 'VIP视频解析',

  siteSlogan: 'VIP视频聚合搜索引擎 · 电影 / 电视剧 / 动漫 / 综艺一网打尽 · 多源智能切换',

  heroTitle: '想看的片，<hl>30秒直达播放源</hl>',

  searchPlaceholder: '搜索电影、电视剧、动漫、演员、导演...',

  hotKeywords: [
    '花开锦绣',
    '九门',
    '有罪之身',
    '欢迎来龙餐馆',
    '八仙',
    '人鱼',
    '去你的岛',
    '我的鸵鸟先生',
    '密档',
    '蜘蛛侠：崭新之日'
  ],

  defaultWideScreen: false,

  stats: [
    { num: '100+', label: '全网资源聚合' },
    { num: '<200ms', label: '毫秒级搜索响应' },
    { num: '4路+', label: '多播放源备份' },
    { num: '0强制', label: '无贴片无会员弹窗' }
  ],

  footer: '© 2026 VIP视频解析 - 仅供学习交流使用'
};
