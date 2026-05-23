import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useTheme } from '../theme/index.js'

const POETRY_FONT = '"Noto Serif SC", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif'

interface Poem {
  title: string
  author: string
  dynasty?: string
  year?: string
  tag: string
  lines: string[]
}

interface PoetryCardProps {
  locale?: string
}

const EN_FONT = '"Georgia", "Times New Roman", serif'

const EN_POEMS: Poem[] = [
  {
    title: 'The Road Not Taken',
    author: 'Robert Frost',
    tag: '1916',
    lines: [
      'Two roads diverged in a yellow wood,',
      'And sorry I could not travel both',
      'And be one traveler, long I stood',
      'And looked down one as far as I could',
      'To where it bent in the undergrowth;',
    ],
  },
  {
    title: 'Sonnet 18',
    author: 'William Shakespeare',
    tag: '1609',
    lines: [
      'Shall I compare thee to a summer\'s day?',
      'Thou art more lovely and more temperate:',
      'Rough winds do shake the darling buds of May,',
      'And summer\'s lease hath all too short a date.',
    ],
  },
  {
    title: 'I Wandered Lonely as a Cloud',
    author: 'William Wordsworth',
    tag: '1807',
    lines: [
      'I wandered lonely as a cloud',
      'That floats on high o\'er vales and hills,',
      'When all at once I saw a crowd,',
      'A host, of golden daffodils;',
    ],
  },
  {
    title: 'Hope is the Thing with Feathers',
    author: 'Emily Dickinson',
    tag: '1891',
    lines: [
      '"Hope" is the thing with feathers -',
      'That perches in the soul -',
      'And sings the tune without the words -',
      'And never stops - at all -',
    ],
  },
  {
    title: 'If—',
    author: 'Rudyard Kipling',
    tag: '1910',
    lines: [
      'If you can keep your head when all about you',
      'Are losing theirs and blaming it on you,',
      'If you can trust yourself when all men doubt you,',
      'But make allowance for their doubting too;',
    ],
  },
  {
    title: 'Do Not Go Gentle into That Good Night',
    author: 'Dylan Thomas',
    tag: '1951',
    lines: [
      'Do not go gentle into that good night,',
      'Old age should burn and rave at close of day;',
      'Rage, rage against the dying of the light.',
    ],
  },
  {
    title: 'Stopping by Woods on a Snowy Evening',
    author: 'Robert Frost',
    tag: '1923',
    lines: [
      'Whose woods these are I think I know.',
      'His house is in the village though;',
      'He will not see me stopping here',
      'To watch his woods fill up with snow.',
    ],
  },
  {
    title: 'Ozymandias',
    author: 'Percy Bysshe Shelley',
    tag: '1818',
    lines: [
      'I met a traveller from an antique land,',
      'Who said — "Two vast and trunkless legs of stone',
      'Stand in the desert. . . . Near them, on the sand,',
      'Half sunk a shattered visage lies,',
    ],
  },
  {
    title: 'The Tyger',
    author: 'William Blake',
    tag: '1794',
    lines: [
      'Tyger Tyger, burning bright,',
      'In the forests of the night;',
      'What immortal hand or eye,',
      'Could frame thy fearful symmetry?',
    ],
  },
  {
    title: 'Invictus',
    author: 'William Ernest Henley',
    tag: '1888',
    lines: [
      'Out of the night that covers me,',
      'Black as the pit from pole to pole,',
      'I thank whatever gods may be',
      'For my unconquerable soul.',
    ],
  },
  {
    title: 'A Dream Within a Dream',
    author: 'Edgar Allan Poe',
    tag: '1849',
    lines: [
      'Take this kiss upon the brow!',
      'And, in parting from you now,',
      'Thus much let me avow —',
      'You are not wrong, who deem',
      'That my days have been a dream;',
    ],
  },
  {
    title: 'Ode to a Nightingale',
    author: 'John Keats',
    tag: '1819',
    lines: [
      'My heart aches, and a drowsy numbness pains',
      'My sense, as though of hemlock I had drunk,',
      'Or emptied some dull opiate to the drains',
      'One minute past, and Lethe-wards had sunk:',
    ],
  },
  {
    title: 'The Waste Land',
    author: 'T.S. Eliot',
    tag: '1922',
    lines: [
      'April is the cruellest month, breeding',
      'Lilacs out of the dead land, mixing',
      'Memory and desire, stirring',
      'Dull roots with spring rain.',
    ],
  },
  {
    title: 'Because I Could Not Stop for Death',
    author: 'Emily Dickinson',
    tag: '1890',
    lines: [
      'Because I could not stop for Death –',
      'He kindly stopped for me –',
      'The Carriage held but just Ourselves –',
      'And Immortality.',
    ],
  },
  {
    title: 'Still I Rise',
    author: 'Maya Angelou',
    tag: '1978',
    lines: [
      'You may write me down in history',
      'With your bitter, twisted lies,',
      'You may trod me in the very dirt',
      'But still, like dust, I\'ll rise.',
    ],
  },
  {
    title: 'The Lake Isle of Innisfree',
    author: 'W.B. Yeats',
    tag: '1893',
    lines: [
      'I will arise and go now, and go to Innisfree,',
      'And a small cabin build there, of clay and wattles made;',
      'Nine bean-rows will I have there, a hive for the honey-bee,',
      'And live alone in the bee-loud glade.',
    ],
  },
  {
    title: 'Annabel Lee',
    author: 'Edgar Allan Poe',
    tag: '1849',
    lines: [
      'It was many and many a year ago,',
      'In a kingdom by the sea,',
      'That a maiden there lived whom you may know',
      'By the name of Annabel Lee;',
    ],
  },
  {
    title: 'When I Heard the Learn\'d Astronomer',
    author: 'Walt Whitman',
    tag: '1865',
    lines: [
      'When I heard the learn\'d astronomer,',
      'When the proofs, the figures, were ranged',
      'in columns before me,',
      'When I was shown the charts and diagrams,',
      'to add, divide, and measure them,',
    ],
  },
  {
    title: 'Daffodils',
    author: 'William Wordsworth',
    tag: '1807',
    lines: [
      'For oft, when on my couch I lie',
      'In vacant or in pensive mood,',
      'They flash upon that inward eye',
      'Which is the bliss of solitude;',
    ],
  },
  {
    title: 'To Autumn',
    author: 'John Keats',
    tag: '1820',
    lines: [
      'Season of mists and mellow fruitfulness,',
      'Close bosom-friend of the maturing sun;',
      'Conspiring with him how to load and bless',
      'With fruit the vines that round the thatch-eves run;',
    ],
  },
]

const POEMS: Poem[] = [
  {
    title: '定風波',
    author: '蘇軾',
    tag: '宋',
    lines: ['莫聽穿林打葉聲', '何妨吟嘯且徐行', '竹杖芒鞋輕勝馬', '誰怕', '一蓑煙雨任平生'],
  },
  {
    title: '赴戍登程口占示家人',
    author: '林則徐',
    tag: '清',
    lines: ['力微任重久神疲', '再竭衰庸定不支', '苟利國家生死以', '豈因禍福避趨之'],
  },
  {
    title: '靜夜思',
    author: '李白',
    tag: '唐',
    lines: ['床前明月光', '疑是地上霜', '舉頭望明月', '低頭思故鄉'],
  },
  {
    title: '登鸛雀樓',
    author: '王之渙',
    tag: '唐',
    lines: ['白日依山盡', '黃河入海流', '欲窮千里目', '更上一層樓'],
  },
  {
    title: '春曉',
    author: '孟浩然',
    tag: '唐',
    lines: ['春眠不覺曉', '處處聞啼鳥', '夜來風雨聲', '花落知多少'],
  },
  {
    title: '江雪',
    author: '柳宗元',
    tag: '唐',
    lines: ['千山鳥飛絕', '萬徑人蹤滅', '孤舟蓑笠翁', '獨釣寒江雪'],
  },
  {
    title: '憫農',
    author: '李紳',
    tag: '唐',
    lines: ['鋤禾日當午', '汗滴禾下土', '誰知盤中餐', '粒粒皆辛苦'],
  },
  {
    title: '望嶽',
    author: '杜甫',
    tag: '唐',
    lines: ['岱宗夫如何', '齊魯青未了', '造化鍾神秀', '陰陽割昏曉'],
  },
  {
    title: '相思',
    author: '王維',
    tag: '唐',
    lines: ['紅豆生南國', '春來發幾枝', '願君多採擷', '此物最相思'],
  },
  {
    title: '出塞',
    author: '王昌齡',
    tag: '唐',
    lines: ['秦時明月漢時關', '萬里長征人未還', '但使龍城飛將在', '不教胡馬度陰山'],
  },
  {
    title: '涼州詞',
    author: '王翰',
    tag: '唐',
    lines: ['葡萄美酒夜光杯', '欲飲琵琶馬上催', '醉臥沙場君莫笑', '古來征戰幾人回'],
  },
  {
    title: '題西林壁',
    author: '蘇軾',
    tag: '宋',
    lines: ['橫看成嶺側成峰', '遠近高低各不同', '不識廬山真面目', '只緣身在此山中'],
  },
  {
    title: '示兒',
    author: '陸游',
    tag: '宋',
    lines: ['死去元知萬事空', '但悲不見九州同', '王師北定中原日', '家祭無忘告乃翁'],
  },
  {
    title: '夏日絕句',
    author: '李清照',
    tag: '宋',
    lines: ['生當作人傑', '死亦為鬼雄', '至今思項羽', '不肯過江東'],
  },
  {
    title: '梅花',
    author: '王安石',
    tag: '宋',
    lines: ['牆角數枝梅', '凌寒獨自開', '遙知不是雪', '為有暗香來'],
  },
  {
    title: '己亥雜詩',
    author: '龔自珍',
    tag: '清',
    lines: ['九州生氣恃風雷', '萬馬齊喑究可哀', '我勸天公重抖擻', '不拘一格降人才'],
  },
  {
    title: '竹石',
    author: '鄭燮',
    tag: '清',
    lines: ['咬定青山不放鬆', '立根原在破巖中', '千磨萬擊還堅勁', '任爾東西南北風'],
  },
  {
    title: '遊山西村',
    author: '陸游',
    tag: '宋',
    lines: ['莫笑農家臘酒渾', '豐年留客足雞豚', '山重水複疑無路', '柳暗花明又一村'],
  },
  {
    title: '烏衣巷',
    author: '劉禹錫',
    tag: '唐',
    lines: ['朱雀橋邊野草花', '烏衣巷口夕陽斜', '舊時王謝堂前燕', '飛入尋常百姓家'],
  },
  {
    title: '芙蓉樓送辛漸',
    author: '王昌齡',
    tag: '唐',
    lines: ['寒雨連江夜入吳', '平明送客楚山孤', '洛陽親友如相問', '一片冰心在玉壺'],
  },
  {
    title: '回鄉偶書',
    author: '賀知章',
    tag: '唐',
    lines: ['少小離家老大回', '鄉音無改鬢毛衰', '兒童相見不相識', '笑問客從何處來'],
  },
  {
    title: '早發白帝城',
    author: '李白',
    tag: '唐',
    lines: ['朝辭白帝彩雲間', '千里江陵一日還', '兩岸猿聲啼不住', '輕舟已過萬重山'],
  },
  {
    title: '絕句',
    author: '杜甫',
    tag: '唐',
    lines: ['兩個黃鸝鳴翠柳', '一行白鷺上青天', '窗含西嶺千秋雪', '門泊東吳萬里船'],
  },
  {
    title: '楓橋夜泊',
    author: '張繼',
    tag: '唐',
    lines: ['月落烏啼霜滿天', '江楓漁火對愁眠', '姑蘇城外寒山寺', '夜半鐘聲到客船'],
  },
  {
    title: '泊船瓜洲',
    author: '王安石',
    tag: '宋',
    lines: ['京口瓜洲一水間', '鍾山只隔數重山', '春風又綠江南岸', '明月何時照我還'],
  },
  {
    title: '山行',
    author: '杜牧',
    tag: '唐',
    lines: ['遠上寒山石徑斜', '白雲生處有人家', '停車坐愛楓林晚', '霜葉紅於二月花'],
  },
  {
    title: '望廬山瀑布',
    author: '李白',
    tag: '唐',
    lines: ['日照香爐生紫煙', '遙看瀑布掛前川', '飛流直下三千尺', '疑是銀河落九天'],
  },
  {
    title: '飲湖上初晴後雨',
    author: '蘇軾',
    tag: '宋',
    lines: ['水光瀲灩晴方好', '山色空濛雨亦奇', '欲把西湖比西子', '淡妝濃抹總相宜'],
  },
  {
    title: '曉出淨慈寺送林子方',
    author: '楊萬里',
    tag: '宋',
    lines: ['畢竟西湖六月中', '風光不與四時同', '接天蓮葉無窮碧', '映日荷花別樣紅'],
  },
  {
    title: '送元二使安西',
    author: '王維',
    tag: '唐',
    lines: ['渭城朝雨浥輕塵', '客舍青青柳色新', '勸君更盡一杯酒', '西出陽關無故人'],
  },
  {
    title: '別董大',
    author: '高適',
    tag: '唐',
    lines: ['千里黃雲白日曛', '北風吹雁雪紛紛', '莫愁前路無知己', '天下誰人不識君'],
  },
  {
    title: '春日',
    author: '朱熹',
    tag: '宋',
    lines: ['勝日尋芳泗水濱', '無邊光景一時新', '等閒識得東風面', '萬紫千紅總是春'],
  },
]

interface FlowPoem {
  title: string
  author: string
  tag: string
  mood: string
  lines: string[]
  dimStart: number
}

const POEMS_FLOW: FlowPoem[] = [
  { title: '定风波', author: '苏轼', tag: '宋', mood: '旷达', lines: ['莫听穿林打叶声，何妨吟啸且徐行。', '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。'], dimStart: 5 },
  { title: '赴戍登程口占示家人', author: '林则徐', tag: '清', mood: '壮志', lines: ['力微任重久神疲，再竭衰庸定不支。', '苟利国家生死以，岂因祸福避趋之。'], dimStart: 7 },
  { title: '静夜思', author: '李白', tag: '唐', mood: '思归', lines: ['床前明月光，疑是地上霜。', '举头望明月，低头思故乡。'], dimStart: 5 },
  { title: '登鹳雀楼', author: '王之涣', tag: '唐', mood: '高远', lines: ['白日依山尽，黄河入海流。', '欲穷千里目，更上一层楼。'], dimStart: 5 },
  { title: '春晓', author: '孟浩然', tag: '唐', mood: '闲适', lines: ['春眠不觉晓，处处闻啼鸟。', '夜来风雨声，花落知多少。'], dimStart: 5 },
  { title: '江雪', author: '柳宗元', tag: '唐', mood: '孤傲', lines: ['千山鸟飞绝，万径人踪灭。', '孤舟蓑笠翁，独钓寒江雪。'], dimStart: 5 },
  { title: '悯农', author: '李绅', tag: '唐', mood: '悯世', lines: ['锄禾日当午，汗滴禾下土。', '谁知盘中餐，粒粒皆辛苦。'], dimStart: 5 },
  { title: '望岳', author: '杜甫', tag: '唐', mood: '豪迈', lines: ['岱宗夫如何，齐鲁青未了。', '造化钟神秀，阴阳割昏晓。'], dimStart: 5 },
  { title: '相思', author: '王维', tag: '唐', mood: '深情', lines: ['红豆生南国，春来发几枝。', '愿君多采撷，此物最相思。'], dimStart: 5 },
  { title: '出塞', author: '王昌龄', tag: '唐', mood: '慷慨', lines: ['秦时明月汉时关，万里长征人未还。', '但使龙城飞将在，不教胡马度阴山。'], dimStart: 7 },
  { title: '凉州词', author: '王翰', tag: '唐', mood: '洒脱', lines: ['葡萄美酒夜光杯，欲饮琵琶马上催。', '醉卧沙场君莫笑，古来征战几人回。'], dimStart: 7 },
  { title: '题西林壁', author: '苏轼', tag: '宋', mood: '超然', lines: ['横看成岭侧成峰，远近高低各不同。', '不识庐山真面目，只缘身在此山中。'], dimStart: 7 },
  { title: '示儿', author: '陆游', tag: '宋', mood: '悲壮', lines: ['死去元知万事空，但悲不见九州同。', '王师北定中原日，家祭无忘告乃翁。'], dimStart: 7 },
  { title: '夏日绝句', author: '李清照', tag: '宋', mood: '风骨', lines: ['生当作人杰，死亦为鬼雄。', '至今思项羽，不肯过江东。'], dimStart: 5 },
  { title: '梅花', author: '王安石', tag: '宋', mood: '清雅', lines: ['墙角数枝梅，凌寒独自开。', '遥知不是雪，为有暗香来。'], dimStart: 5 },
  { title: '己亥杂诗', author: '龚自珍', tag: '清', mood: '磊落', lines: ['九州生气恃风雷，万马齐喑究可哀。', '我劝天公重抖擞，不拘一格降人才。'], dimStart: 7 },
  { title: '竹石', author: '郑燮', tag: '清', mood: '坚韧', lines: ['咬定青山不放松，立根原在破岩中。', '千磨万击还坚劲，任尔东西南北风。'], dimStart: 7 },
  { title: '游山西村', author: '陆游', tag: '宋', mood: '悠然', lines: ['莫笑农家腊酒浑，丰年留客足鸡豚。', '山重水复疑无路，柳暗花明又一村。'], dimStart: 7 },
  { title: '乌衣巷', author: '刘禹锡', tag: '唐', mood: '怀古', lines: ['朱雀桥边野草花，乌衣巷口夕阳斜。', '旧时王谢堂前燕，飞入寻常百姓家。'], dimStart: 7 },
  { title: '芙蓉楼送辛渐', author: '王昌龄', tag: '唐', mood: '淡泊', lines: ['寒雨连江夜入吴，平明送客楚山孤。', '洛阳亲友如相问，一片冰心在玉壶。'], dimStart: 7 },
  { title: '回乡偶书', author: '贺知章', tag: '唐', mood: '感怀', lines: ['少小离家老大回，乡音无改鬓毛衰。', '儿童相见不相识，笑问客从何处来。'], dimStart: 7 },
  { title: '早发白帝城', author: '李白', tag: '唐', mood: '飘逸', lines: ['朝辞白帝彩云间，千里江陵一日还。', '两岸猿声啼不住，轻舟已过万重山。'], dimStart: 7 },
  { title: '绝句', author: '杜甫', tag: '唐', mood: '灵动', lines: ['两个黄鹂鸣翠柳，一行白鹭上青天。', '窗含西岭千秋雪，门泊东吴万里船。'], dimStart: 7 },
  { title: '枫桥夜泊', author: '张继', tag: '唐', mood: '惆怅', lines: ['月落乌啼霜满天，江枫渔火对愁眠。', '姑苏城外寒山寺，夜半钟声到客船。'], dimStart: 7 },
  { title: '泊船瓜洲', author: '王安石', tag: '宋', mood: '思归', lines: ['京口瓜洲一水间，钟山只隔数重山。', '春风又绿江南岸，明月何时照我还。'], dimStart: 7 },
  { title: '山行', author: '杜牧', tag: '唐', mood: '闲适', lines: ['远上寒山石径斜，白云生处有人家。', '停车坐爱枫林晚，霜叶红于二月花。'], dimStart: 7 },
  { title: '望庐山瀑布', author: '李白', tag: '唐', mood: '豪迈', lines: ['日照香炉生紫烟，遥看瀑布挂前川。', '飞流直下三千尺，疑是银河落九天。'], dimStart: 7 },
  { title: '饮湖上初晴后雨', author: '苏轼', tag: '宋', mood: '隽永', lines: ['水光潋滟晴方好，山色空蒙雨亦奇。', '欲把西湖比西子，淡妆浓抹总相宜。'], dimStart: 7 },
  { title: '晓出净慈寺送林子方', author: '杨万里', tag: '宋', mood: '明快', lines: ['毕竟西湖六月中，风光不与四时同。', '接天莲叶无穷碧，映日荷花别样红。'], dimStart: 7 },
  { title: '送元二使安西', author: '王维', tag: '唐', mood: '惜别', lines: ['渭城朝雨浥轻尘，客舍青青柳色新。', '劝君更尽一杯酒，西出阳关无故人。'], dimStart: 7 },
  { title: '别董大', author: '高适', tag: '唐', mood: '豁达', lines: ['千里黄云白日曛，北风吹雁雪纷纷。', '莫愁前路无知己，天下谁人不识君。'], dimStart: 7 },
  { title: '春日', author: '朱熹', tag: '宋', mood: '欣悦', lines: ['胜日寻芳泗水滨，无边光景一时新。', '等闲识得东风面，万紫千红总是春。'], dimStart: 7 },
]

function getDailyPoem(poems: Poem[]): Poem {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  return poems[dayOfYear % poems.length]
}

const arrowBtnStyle: React.CSSProperties = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  width: 28, height: 28, borderRadius: '50%',
  border: 'none', background: 'rgba(255,255,255,0.9)',
  backdropFilter: 'blur(8px)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-muted, #888)', fontSize: 16, lineHeight: 1,
  opacity: 0, transition: 'opacity 0.25s ease',
  zIndex: 2,
}

export function PoetryCard({ locale = 'zh' }: PoetryCardProps) {
  const { theme: appTheme } = useTheme()
  const isEn = locale === 'en'
  const poems = isEn ? EN_POEMS : POEMS

  const [index, setIndex] = useState(0)
  const [fading, setFading] = useState(false)
  const [hovered, setHovered] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; locked: boolean } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const poem = poems[index]

  const navigate = useCallback(() => {
    setFading(true)
    setTimeout(() => {
      setIndex(prev => {
        let next: number
        do { next = Math.floor(Math.random() * poems.length) } while (next === prev && poems.length > 1)
        return next
      })
      setFading(false)
    }, 80)
  }, [poems.length])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (fading) return
    if ((e.target as HTMLElement).closest('button')) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, locked: false }
    containerRef.current?.setPointerCapture(e.pointerId)
  }, [fading])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    dragRef.current = null
    if (Math.abs(dx) > 50) navigate()
  }, [navigate])

  const contentStyle: React.CSSProperties = {
    opacity: fading ? 0 : 1,
    transition: 'opacity 0.08s ease',
  }

  const cardBase: React.CSSProperties = {
    borderRadius: 8,
    border: '1px solid var(--paper-edge, #E5DCC4)',
    background: 'linear-gradient(180deg, #FCFAF3 0%, #F4EDDB 100%)',
    position: 'relative',
    overflow: 'hidden',
    touchAction: 'pan-y',
    userSelect: 'none',
  }

  const arrows = (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); navigate() }}
        style={{ ...arrowBtnStyle, left: 8, opacity: hovered ? 0.8 : 0 }}
        aria-label="Previous"
      >‹</button>
      <button
        onClick={(e) => { e.stopPropagation(); navigate() }}
        style={{ ...arrowBtnStyle, right: 8, opacity: hovered ? 0.8 : 0 }}
        aria-label="Next"
      >›</button>
    </>
  )

  // Notebook theme: torn calendar + ruled notebook poem card
  if (appTheme === 'notebook') {
    const flowPoem = isEn ? null : POEMS_FLOW[index % POEMS_FLOW.length]
    const now = new Date()
    const weekdays = isEn
      ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      : ['日','一','二','三','四','五','六']
    const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
    const monthNamesEn = ['January','February','March','April','May','June','July','August','September','October','November','December']
    let lunarStr = ''
    const solarTerms: [number, string, number][] = [
      [0,'小寒',5.4055],[0,'大寒',20.12],[1,'立春',3.87],[1,'雨水',18.73],
      [2,'惊蛰',5.63],[2,'春分',20.646],[3,'清明',4.81],[3,'谷雨',20.1],
      [4,'立夏',5.52],[4,'小满',21.04],[5,'芒种',5.678],[5,'夏至',21.37],
      [6,'小暑',7.108],[6,'大暑',22.83],[7,'立秋',7.5],[7,'处暑',23.13],
      [8,'白露',7.646],[8,'秋分',23.042],[9,'寒露',8.318],[9,'霜降',23.438],
      [10,'立冬',7.438],[10,'小雪',22.36],[11,'大雪',7.18],[11,'冬至',21.94],
    ]
    if (!isEn) {
      try {
        const lunarDayNames = ['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
          '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
          '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十']
        const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' })
        const parts = fmt.formatToParts(now)
        const lunarMonth = parts.find(p => p.type === 'month')?.value
        const lunarDay = parseInt(parts.find(p => p.type === 'day')?.value || '1')
        lunarStr = `${lunarMonth}${lunarDayNames[lunarDay] || lunarDay}`
      } catch {}
    }
    const y = now.getFullYear() - 2000
    const m = now.getMonth()
    const dd = now.getDate()
    const calcDay = (c: number) => Math.floor(y * 0.2422 + c) - Math.floor(y / 4)
    const monthTerms = solarTerms.filter(t => t[0] === m)
    let termStr = ''
    let termDesc = ''
    const termDescMap: Record<string, string> = {
      '小寒':'冬至后十五日','大寒':'寒之极','立春':'春气始至','雨水':'始雨水',
      '惊蛰':'蛰虫始振','春分':'日夜分','清明':'万物齐洁','谷雨':'雨生百谷',
      '立夏':'夏气始至','小满':'物至于此，小得盈满','芒种':'有芒之种谷可稼种',
      '夏至':'日长之至','小暑':'暑气至此尚小','大暑':'暑气最盛','立秋':'秋气始至',
      '处暑':'暑气止','白露':'阴气渐重，凝为白露','秋分':'日夜分','寒露':'露气寒',
      '霜降':'气肃而凝，露结为霜','立冬':'冬气始至','小雪':'始小雪','大雪':'雪至此为盛',
      '冬至':'阴极之至',
    }
    if (monthTerms.length === 2) {
      const d1 = calcDay(monthTerms[0][2])
      const d2 = calcDay(monthTerms[1][2])
      if (dd === d2) { termStr = monthTerms[1][1]; termDesc = termDescMap[termStr] || '' }
      else if (dd === d1) { termStr = monthTerms[0][1]; termDesc = termDescMap[termStr] || '' }
    }
    const dailyQuotes = [
      '读书不觉已春深，一寸光阴一寸金',
      '腹有诗书气自华',
      '好读书，不求甚解',
      '书卷多情似故人，晨昏忧乐每相亲',
      '读书破万卷，下笔如有神',
      '半亩方塘一鉴开，天光云影共徘徊',
      '纸上得来终觉浅，绝知此事要躬行',
      '问渠那得清如许，为有源头活水来',
      '旧书不厌百回读，熟读深思子自知',
      '少年辛苦终身事，莫向光阴惰寸功',
      '三更灯火五更鸡，正是男儿读书时',
      '万般皆下品，惟有读书高',
      '书山有路勤为径，学海无涯苦作舟',
      '粗缯大布裹生涯，腹有诗书气自华',
      '风声雨声读书声，声声入耳',
      '鸟欲高飞先振翅，人求上进先读书',
      '黑发不知勤学早，白首方悔读书迟',
      '立身以立学为先，立学以读书为本',
      '盛年不重来，一日难再晨',
      '及时当勉励，岁月不待人',
      '不畏浮云遮望眼，自缘身在最高层',
      '千淘万漉虽辛苦，吹尽狂沙始到金',
      '长风破浪会有时，直挂云帆济沧海',
      '沉舟侧畔千帆过，病树前头万木春',
      '山重水复疑无路，柳暗花明又一村',
      '欲穷千里目，更上一层楼',
      '会当凌绝顶，一览众山小',
      '海内存知己，天涯若比邻',
      '莫愁前路无知己，天下谁人不识君',
      '天生我材必有用，千金散尽还复来',
      '春风得意马蹄疾，一日看尽长安花',
    ]
    const displayTitle = flowPoem?.title ?? poem.title
    const displayAuthor = flowPoem?.author ?? poem.author
    const displayTag = flowPoem?.tag ?? poem.tag

    const highlightStyle: React.CSSProperties = {
      background: 'linear-gradient(180deg, transparent 55%, rgba(240,168,88,0.4) 55%)',
      padding: '0 2px',
    }
    const renderNotebookLines = () => {
      if (!flowPoem) {
        const lastIdx = poem.lines.length - 1
        return poem.lines.map((line, i) => (
          <div key={i}>{i === lastIdx ? <span style={highlightStyle}>{line}</span> : line}</div>
        ))
      }
      return flowPoem.lines.map((line, li) => {
        const isLastLine = li === flowPoem.lines.length - 1
        if (!isLastLine) return <div key={li}>{line}</div>
        const lastPunc = Math.max(line.lastIndexOf('，'), line.lastIndexOf('？'), line.lastIndexOf('！'), line.lastIndexOf('；'))
        if (lastPunc === -1 || lastPunc >= line.length - 2) return <div key={li}><span style={highlightStyle}>{line}</span></div>
        const bright = line.slice(0, lastPunc + 1)
        const highlighted = line.slice(lastPunc + 1)
        return <div key={li}>{bright}<span style={highlightStyle}>{highlighted}</span></div>
      })
    }

    const calendarAccent = '#E07856'
    const yearNo = now.getFullYear()
    const dayOfYear = Math.floor((now.getTime() - new Date(yearNo, 0, 0).getTime()) / 86400000)
    const dailyQuote = dailyQuotes[dayOfYear % dailyQuotes.length]

    const BASE_W = 960
    const BASE_H = 260

    const scaleRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)
    useEffect(() => {
      const el = scaleRef.current?.parentElement
      if (!el) return
      const obs = new ResizeObserver(entries => {
        const w = entries[0]?.contentRect.width ?? 0
        if (w > 0) setScale(w / BASE_W)
      })
      obs.observe(el)
      return () => obs.disconnect()
    }, [])

    return (
      <div style={{ width: '100%', height: BASE_H * scale, position: 'relative', overflow: 'hidden' }}>
      <div
        ref={scaleRef}
        style={{
          display: 'flex', gap: 18, position: 'absolute', top: 0, left: 0,
          width: BASE_W, height: BASE_H,
          transform: `scale(${scale})`, transformOrigin: 'top left',
        }}
      >
        {/* ── Torn calendar date card ── */}
        <div style={{
          background: '#fff', borderRadius: 14, position: 'relative', overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(60,40,20,0.08), 0 2px 4px rgba(60,40,20,0.04)',
          display: 'flex', flexDirection: 'column',
          width: 310, flexShrink: 0,
        }}>
          {/* Orange header with binding holes + month label */}
          <div style={{
            background: `linear-gradient(180deg, ${calendarAccent} 0%, #C66045 100%)`,
            padding: '10px 24px 6px', textAlign: 'center', position: 'relative',
          }}>
            {/* Month text */}
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
              textTransform: 'uppercase', color: '#fff',
            }}>
              {isEn
                ? monthNamesEn[m].toUpperCase()
                : `${monthNames[m]} · ${monthNamesEn[m].substring(0, 3).toUpperCase()}`
              }
            </div>
          </div>
          {/* Card body */}
          <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Day number */}
            <div style={{
              fontSize: 72, fontWeight: 700, color: 'var(--ink, #2A2722)', lineHeight: 1,
              letterSpacing: '-0.04em', textAlign: 'center', fontFamily: '"Inter", sans-serif',
            }}>{dd}</div>
            {/* Weekday */}
            <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-soft, #5C564E)', fontWeight: 500, marginTop: 6 }}>
              {isEn ? weekdays[now.getDay()] : `周${weekdays[now.getDay()]}`}
            </div>
            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border, #F0EBE0)', margin: '14px 0' }} />
            {/* Extra info */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: 'var(--ink-mute, #8A8377)', flexWrap: 'wrap' }}>
              {lunarStr && <span style={{ fontWeight: 500 }}>{lunarStr}</span>}
              {!lunarStr && <span>{now.getFullYear()}</span>}
              {termStr && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 11,
                  background: '#E8F1FB', color: '#4A90E2',
                  fontSize: 11, fontWeight: 600,
                }}>
                  <span style={{ width: 5, height: 5, background: '#4A90E2', borderRadius: '50%' }} />
                  {termStr}
                </span>
              )}
            </div>
            {/* Handwritten note */}
            <div style={{
              marginTop: 14, fontFamily: '"Caveat", "Kalam", cursive', fontSize: 17,
              color: calendarAccent, textAlign: 'center', transform: 'rotate(-2deg)',
              borderTop: '1px dashed var(--border, #F0EBE0)', paddingTop: 10,
            }}>
              {termDesc ? `${termDesc} ~` : dailyQuote}
            </div>
          </div>
        </div>

        {/* ── Notebook ruled poem card ── */}
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { dragRef.current = null }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
          background: '#fff', borderRadius: 14, padding: '26px 30px', position: 'relative', overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(60,40,20,0.08), 0 2px 4px rgba(60,40,20,0.04)',
          flex: 1, minWidth: 0,
          backgroundImage: Array.from({ length: 8 }, (_, i) => {
            const y = 28 + i * 34
            return `linear-gradient(180deg, transparent 0%, transparent ${y}px, rgba(74,144,226,0.08) ${y}px, rgba(74,144,226,0.08) ${y + 1}px, transparent ${y + 1}px)`
          }).join(','),
        }}>
          {/* Red binding margin line */}
          <div style={{ position: 'absolute', left: 48, top: 0, bottom: 0, width: 1, background: 'rgba(224,120,86,0.4)' }} />
          {/* Binding holes */}
          {[32, 64, 96, 128, 160, 192].map(top => (
            <div key={top} style={{
              position: 'absolute', left: 16, top, width: 7, height: 7, borderRadius: '50%',
              background: 'var(--bg, #F3EEE5)',
            }} />
          ))}

          <div style={contentStyle}>
            {/* Poem header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginLeft: 32, marginBottom: 12, paddingBottom: 8,
              borderBottom: '1px solid var(--border, #F0EBE0)',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-mute, #8A8377)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <span style={{ fontSize: 14 }}>✦</span>
                {isEn ? 'Daily Verse' : '今日一首'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-faint, #B8B0A0)' }}>
                {yearNo} · No.{String(dayOfYear).padStart(3, '0')}
              </span>
            </div>
            {/* Poem text */}
            <div style={{
              marginLeft: 32, fontFamily: isEn ? '"Inter", serif' : '"Source Han Serif SC", "Noto Serif SC", "Songti SC", serif',
              fontSize: 18, fontWeight: 400, color: 'var(--ink, #2A2722)', lineHeight: '34px',
              letterSpacing: isEn ? '0' : '0.05em',
            }}>
              {renderNotebookLines()}
            </div>
            {/* Author */}
            <div style={{ marginLeft: 32, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border, #F0EBE0)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #A8835C, #E8D9B8)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: '"Source Han Serif SC", "Noto Serif SC", serif', fontSize: 14, fontWeight: 600,
              }}>{displayAuthor[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--ink, #2A2722)', fontWeight: 600 }}>
                  {displayAuthor} ·《{displayTitle}》
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-mute, #8A8377)' }}>
                  {displayTag}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={(e) => e.stopPropagation()} style={{
                  width: 30, height: 30, borderRadius: '50%', border: 'none',
                  background: '#FAF5EA', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#E07856', cursor: 'pointer', fontSize: 14,
                }}>♥</button>
                <button onClick={(e) => e.stopPropagation()} style={{
                  width: 30, height: 30, borderRadius: '50%', border: 'none',
                  background: '#FAF5EA', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--ink-soft, #5C564E)', cursor: 'pointer', fontSize: 14,
                }}>⤴</button>
                <button onClick={(e) => { e.stopPropagation(); navigate() }} style={{
                  width: 30, height: 30, borderRadius: '50%', border: 'none',
                  background: '#FAF5EA', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--ink-soft, #5C564E)', cursor: 'pointer', fontSize: 14,
                }}>↻</button>
              </div>
            </div>
          </div>
          {/* Handwritten annotation */}
          <div style={{
            position: 'absolute', bottom: 14, right: 20,
            fontFamily: '"Caveat", "Kalam", cursive', fontSize: 16,
            color: calendarAccent, transform: 'rotate(-3deg)', pointerEvents: 'none',
          }}>
            ⌐ {isEn ? 'poetic' : (flowPoem?.mood ?? '诗意')} ☂
          </div>
        </div>
      </div>
      </div>
    )
  }

  // Minimal theme: two-column date + quote layout
  if (appTheme === 'minimal') {
    const flowPoem = isEn ? null : POEMS_FLOW[index % POEMS_FLOW.length]
    const now = new Date()
    const weekdays = isEn
      ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      : ['日','一','二','三','四','五','六']
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    let lunarStr = ''
    const solarTerms: [number, string, number][] = [
      [0,'小寒',5.4055],[0,'大寒',20.12],[1,'立春',3.87],[1,'雨水',18.73],
      [2,'惊蛰',5.63],[2,'春分',20.646],[3,'清明',4.81],[3,'谷雨',20.1],
      [4,'立夏',5.52],[4,'小满',21.04],[5,'芒种',5.678],[5,'夏至',21.37],
      [6,'小暑',7.108],[6,'大暑',22.83],[7,'立秋',7.5],[7,'处暑',23.13],
      [8,'白露',7.646],[8,'秋分',23.042],[9,'寒露',8.318],[9,'霜降',23.438],
      [10,'立冬',7.438],[10,'小雪',22.36],[11,'大雪',7.18],[11,'冬至',21.94],
    ]
    if (!isEn) {
      try {
        const lunarDayNames = ['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
          '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
          '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十']
        const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' })
        const parts = fmt.formatToParts(now)
        const lunarMonth = parts.find(p => p.type === 'month')?.value
        const lunarDay = parseInt(parts.find(p => p.type === 'day')?.value || '1')
        lunarStr = `${lunarMonth}${lunarDayNames[lunarDay] || lunarDay}`
      } catch {}
    }
    const y = now.getFullYear() - 2000
    const m = now.getMonth()
    const dd = now.getDate()
    const calcDay = (c: number) => Math.floor(y * 0.2422 + c) - Math.floor(y / 4)
    const monthTerms = solarTerms.filter(t => t[0] === m)
    let termStr = ''
    let termDesc = ''
    const termDescMap: Record<string, string> = {
      '小寒':'冬至后十五日','大寒':'寒之极','立春':'春气始至','雨水':'始雨水',
      '惊蛰':'蛰虫始振','春分':'日夜分','清明':'万物齐洁','谷雨':'雨生百谷',
      '立夏':'夏气始至','小满':'物至于此，小得盈满','芒种':'有芒之种谷可稼种',
      '夏至':'日长之至','小暑':'暑气至此尚小','大暑':'暑气最盛','立秋':'秋气始至',
      '处暑':'暑气止','白露':'阴气渐重，凝为白露','秋分':'日夜分','寒露':'露气寒',
      '霜降':'气肃而凝，露结为霜','立冬':'冬气始至','小雪':'始小雪','大雪':'雪至此为盛',
      '冬至':'阴极之至',
    }
    if (monthTerms.length === 2) {
      const d1 = calcDay(monthTerms[0][2])
      const d2 = calcDay(monthTerms[1][2])
      if (dd === d2) { termStr = monthTerms[1][1]; termDesc = termDescMap[termStr] || '' }
      else if (dd === d1) { termStr = monthTerms[0][1]; termDesc = termDescMap[termStr] || '' }
    }
    const dailyQuotes2 = [
      '读书不觉已春深，一寸光阴一寸金',
      '腹有诗书气自华',
      '好读书，不求甚解',
      '书卷多情似故人，晨昏忧乐每相亲',
      '读书破万卷，下笔如有神',
      '半亩方塘一鉴开，天光云影共徘徊',
      '纸上得来终觉浅，绝知此事要躬行',
      '问渠那得清如许，为有源头活水来',
      '旧书不厌百回读，熟读深思子自知',
      '少年辛苦终身事，莫向光阴惰寸功',
      '三更灯火五更鸡，正是男儿读书时',
      '万般皆下品，惟有读书高',
      '书山有路勤为径，学海无涯苦作舟',
      '粗缯大布裹生涯，腹有诗书气自华',
      '风声雨声读书声，声声入耳',
      '鸟欲高飞先振翅，人求上进先读书',
      '黑发不知勤学早，白首方悔读书迟',
      '立身以立学为先，立学以读书为本',
      '盛年不重来，一日难再晨',
      '及时当勉励，岁月不待人',
      '不畏浮云遮望眼，自缘身在最高层',
      '千淘万漉虽辛苦，吹尽狂沙始到金',
      '长风破浪会有时，直挂云帆济沧海',
      '沉舟侧畔千帆过，病树前头万木春',
      '山重水复疑无路，柳暗花明又一村',
      '欲穷千里目，更上一层楼',
      '会当凌绝顶，一览众山小',
      '海内存知己，天涯若比邻',
      '莫愁前路无知己，天下谁人不识君',
      '天生我材必有用，千金散尽还复来',
      '春风得意马蹄疾，一日看尽长安花',
    ]
    const dayOfYear2 = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
    const dailyQuote2 = dailyQuotes2[dayOfYear2 % dailyQuotes2.length]

    const displayTitle = flowPoem?.title ?? poem.title
    const displayAuthor = flowPoem?.author ?? poem.author
    const displayTag = flowPoem?.tag ?? poem.tag

    const renderFlowLines = () => {
      if (!flowPoem) {
        return poem.lines.map((line, i) => <div key={i}>{line}</div>)
      }
      return flowPoem.lines.map((line, li) => {
        const isLastLine = li === flowPoem.lines.length - 1
        if (!isLastLine) return <div key={li}>{line}</div>
        const lastPunc = Math.max(line.lastIndexOf('，'), line.lastIndexOf('？'), line.lastIndexOf('！'), line.lastIndexOf('；'))
        if (lastPunc === -1 || lastPunc >= line.length - 2) return <div key={li}><span style={{ color: 'var(--ink-mute)' }}>{line}</span></div>
        const bright = line.slice(0, lastPunc + 1)
        const dim = line.slice(lastPunc + 1)
        return <div key={li}>{bright}<span style={{ color: 'var(--ink-mute)' }}>{dim}</span></div>
      })
    }

    const navBtnStyle: React.CSSProperties = {
      width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--ink-mute)', cursor: 'pointer', background: 'none',
      fontSize: 13, padding: 0,
    }

    return (
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24,
        }}
      >
        {/* Date block */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 48, fontWeight: 300, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.04em' }}>
            <span style={{ fontSize: 20, color: 'var(--ink-mute)', fontWeight: 400, marginRight: 4 }}>{monthNames[now.getMonth()]}</span>
            {now.getDate()}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-mute)' }}>
            {isEn ? weekdays[now.getDay()] : `周${weekdays[now.getDay()]}`}
            {lunarStr && ` · ${lunarStr}`}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {termStr ? (
              <>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  height: 22, padding: '0 9px', borderRadius: 11,
                  background: 'var(--hover)', fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500,
                  border: '1px solid var(--border)',
                }}>
                  <span style={{ width: 5, height: 5, background: '#10B981', borderRadius: '50%' }} />
                  {termStr}
                </span>
                {termDesc && <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{termDesc}</span>}
              </>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>{dailyQuote2}</span>
            )}
          </div>
        </div>

        {/* Quote block */}
        <div style={{
          paddingLeft: 24, borderLeft: '2px solid var(--ink)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={contentStyle}>
            <div style={{
              fontFamily: isEn ? '"Inter", serif' : '"Noto Serif SC", "Songti SC", "STSong", serif',
              fontSize: 18, fontWeight: 400, color: 'var(--ink)', lineHeight: 1.8,
              letterSpacing: isEn ? '0' : '0.02em',
            }}>
              {renderFlowLines()}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-faint)' }}>
              <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>{displayAuthor}</span>
              <span style={{ margin: '0 6px', color: 'var(--ink-ghost)' }}>·</span>
              《{displayTitle}》
              {displayTag !== displayTitle && <>
                <span style={{ margin: '0 6px', color: 'var(--ink-ghost)' }}>·</span>
                {displayTag}
              </>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
            <button onClick={(e) => { e.stopPropagation(); navigate() }} style={navBtnStyle}>‹</button>
            <button onClick={(e) => { e.stopPropagation(); navigate() }} style={navBtnStyle}>›</button>
            <button onClick={(e) => { e.stopPropagation(); navigate() }} style={{ ...navBtnStyle, marginLeft: 'auto' }}>↻</button>
          </div>
        </div>
      </div>
    )
  }

  if (isEn) {
    const now = new Date()
    return (
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ ...cardBase, padding: '36px 48px', minHeight: 240 }}
      >
        <div style={{
          position: 'absolute', top: 14, left: 14, width: 36, height: 36,
          borderTop: '1px solid #A8392C', borderLeft: '1px solid #A8392C', opacity: 0.5,
        }} />
        <div style={{
          position: 'absolute', bottom: 14, right: 14, width: 36, height: 36,
          borderBottom: '1px solid #A8392C', borderRight: '1px solid #A8392C', opacity: 0.5,
        }} />
        {arrows}
        <div style={contentStyle}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.2em',
            color: '#9A938A', textTransform: 'uppercase', marginBottom: 16,
          }}>
            {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div style={{
            fontFamily: '"Cormorant Garamond", serif', fontSize: 18, lineHeight: 1.9,
            fontStyle: 'italic', color: '#1C1A17',
          }}>
            {poem.lines.map((line, i) => <div key={i}>{line}</div>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 24 }}>
            <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 15, color: '#3D3935' }}>
              — {poem.author}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '2px 10px', borderRadius: 4, background: '#B73E2A',
              color: '#FBE9D8', fontSize: 11, fontFamily: '"Cormorant Garamond", serif', fontWeight: 600,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
            }}>
              {poem.tag}
            </span>
          </div>
          <div style={{
            fontFamily: POETRY_FONT, color: '#6E6862', fontSize: 12, marginTop: 8, letterSpacing: '0.05em',
          }}>
            <em>"{poem.title}"</em>
          </div>
        </div>
      </div>
    )
  }

  // Date info for Chinese card
  const now = new Date()
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const lunarDayNames = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
    '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
    '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十']
  let lunarStr = ''
  try {
    const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' })
    const parts = fmt.formatToParts(now)
    const lunarMonth = parts.find(p => p.type === 'month')?.value
    const lunarDay = parseInt(parts.find(p => p.type === 'day')?.value || '1')
    lunarStr = `${lunarMonth}${lunarDayNames[lunarDay] || lunarDay}`
  } catch {}

  const solarTerms: [number, string, number][] = [
    [0,'小寒',5.4055],[0,'大寒',20.12],[1,'立春',3.87],[1,'雨水',18.73],
    [2,'惊蛰',5.63],[2,'春分',20.646],[3,'清明',4.81],[3,'谷雨',20.1],
    [4,'立夏',5.52],[4,'小满',21.04],[5,'芒种',5.678],[5,'夏至',21.37],
    [6,'小暑',7.108],[6,'大暑',22.83],[7,'立秋',7.5],[7,'处暑',23.13],
    [8,'白露',7.646],[8,'秋分',23.042],[9,'寒露',8.318],[9,'霜降',23.438],
    [10,'立冬',7.438],[10,'小雪',22.36],[11,'大雪',7.18],[11,'冬至',21.94],
  ]
  const y = now.getFullYear() - 2000
  const m = now.getMonth()
  const d = now.getDate()
  const calcDay = (c: number) => Math.floor(y * 0.2422 + c) - Math.floor(y / 4)
  const monthTerms = solarTerms.filter(t => t[0] === m)
  let termStr = ''
  if (monthTerms.length === 2) {
    const d1 = calcDay(monthTerms[0][2])
    const d2 = calcDay(monthTerms[1][2])
    if (d === d1) termStr = monthTerms[0][1]
    else if (d === d2) termStr = monthTerms[1][1]
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragRef.current = null }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...cardBase,
        padding: '36px 48px',
        minHeight: 280,
        display: 'flex', alignItems: 'stretch', justifyContent: 'space-between',
      }}
    >
      {/* Corner decorations */}
      <div style={{
        position: 'absolute', top: 14, left: 14, width: 36, height: 36,
        borderTop: '1px solid #A8392C', borderLeft: '1px solid #A8392C', opacity: 0.5,
      }} />
      <div style={{
        position: 'absolute', bottom: 14, right: 14, width: 36, height: 36,
        borderBottom: '1px solid #A8392C', borderRight: '1px solid #A8392C', opacity: 0.5,
      }} />

      {arrows}

      {/* Left side: date + author */}
      <div style={{ ...contentStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', maxWidth: '46%' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: POETRY_FONT, fontWeight: 500, color: '#1C1A17', fontSize: 20, letterSpacing: '0.02em' }}>
              <span style={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 500, fontStyle: 'italic', fontSize: 24, color: '#A8392C', marginRight: 2 }}>{now.getMonth() + 1}</span>
              月
              <span style={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 500, fontStyle: 'italic', fontSize: 24, color: '#A8392C', marginRight: 2 }}>{now.getDate()}</span>
              日 · 周{weekdays[now.getDay()]}
            </span>
            <span style={{ width: 1, height: 14, background: '#C4BCAD' }} />
            {lunarStr && <span style={{ fontFamily: POETRY_FONT, color: '#6E6862', fontSize: 15 }}>{lunarStr}</span>}
            {termStr && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 12px', background: '#6B8E7F', color: '#F4EDDB',
                borderRadius: 3, fontFamily: POETRY_FONT, fontSize: 12, fontWeight: 500,
                letterSpacing: '0.1em',
              }}>
                <span style={{ width: 4, height: 4, background: '#F4EDDB', borderRadius: '50%' }} />
                {termStr}
              </span>
            )}
          </div>
          <div style={{
            fontFamily: POETRY_FONT, color: '#6E6862', fontSize: 13, letterSpacing: '0.1em',
          }}>
            今日卷 · <span style={{ color: '#3D3935', fontWeight: 500 }}>《{poem.title}》</span>
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.2em',
            color: '#9A938A', textTransform: 'uppercase', marginBottom: 10,
          }}>— Author</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              display: 'flex', flexDirection: 'column',
              fontFamily: POETRY_FONT, fontSize: 18, color: '#3D3935',
              lineHeight: 1.15, letterSpacing: '0.08em', fontWeight: 500,
            }}>
              {poem.author.split('').map((ch, i) => <span key={i}>{ch}</span>)}
            </div>
            <div style={{
              width: 38, height: 38, background: '#B73E2A', color: '#FBE9D8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: POETRY_FONT, fontSize: 18, fontWeight: 600,
              borderRadius: 4, boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18)',
              transform: 'rotate(-3deg)',
            }}>
              {poem.tag}
            </div>
          </div>
        </div>
      </div>

      {/* Right side: vertical poem */}
      <div style={{ ...contentStyle, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{
          display: 'flex', flexDirection: 'row-reverse', gap: 14,
          fontFamily: POETRY_FONT, fontWeight: 400,
          fontSize: 22, color: '#1C1A17',
          lineHeight: 1.5, letterSpacing: '0.05em',
        }}>
          {poem.lines.map((line, i) => (
            <div key={i} style={{
              writingMode: 'vertical-rl', textOrientation: 'upright',
              padding: '6px 4px',
              color: i === 0 ? '#8C2A1F' : undefined,
            }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
