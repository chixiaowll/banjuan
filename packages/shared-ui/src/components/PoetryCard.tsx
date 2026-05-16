import React, { useMemo, useEffect } from 'react'

const POETRY_FONT = '"Noto Serif TC", "Source Han Serif TC", "PMingLiU", serif'
const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600;700&display=swap'

let fontLoaded = false
function loadPoetryFont() {
  if (fontLoaded || typeof document === 'undefined') return
  fontLoaded = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = FONT_CSS_URL
  document.head.appendChild(link)
}

interface Poem {
  title: string
  author: string
  tag: string
  lines: string[]
}

interface PoetryCardProps {
  locale?: 'zh' | 'en'
}

const EN_FONT = '"Noto Serif", "Georgia", "Times New Roman", serif'
const EN_FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400&display=swap'

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

function getDailyPoem(poems: Poem[]): Poem {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  return poems[dayOfYear % poems.length]
}

export function PoetryCard({ locale = 'zh' }: PoetryCardProps) {
  const isEn = locale === 'en'

  useEffect(() => {
    loadPoetryFont()
    if (isEn) {
      if (typeof document === 'undefined') return
      const existing = document.querySelector(`link[href="${EN_FONT_CSS_URL}"]`)
      if (existing) return
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = EN_FONT_CSS_URL
      document.head.appendChild(link)
    }
  }, [isEn])

  const poem = useMemo(() => getDailyPoem(isEn ? EN_POEMS : POEMS), [isEn])

  if (isEn) {
    return (
      <div style={{
        borderRadius: 16,
        border: '1px solid var(--border, #e8e8e8)',
        background: 'var(--surface, #fff)',
        padding: '32px 28px',
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        <div style={{
          fontFamily: EN_FONT,
          fontSize: 16,
          lineHeight: 1.9,
          fontStyle: 'italic',
          color: 'var(--text, #1a1a1a)',
        }}>
          {poem.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 20,
        }}>
          <span style={{
            fontFamily: EN_FONT,
            fontSize: 14,
            color: 'var(--text-muted, #888)',
          }}>
            — {poem.author}
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px 8px',
            borderRadius: 4,
            background: '#c0392b',
            color: '#fff',
            fontSize: 11,
            fontFamily: EN_FONT,
            fontWeight: 600,
          }}>
            {poem.tag}
          </span>
        </div>
      </div>
    )
  }

  const maxLineLen = Math.max(...poem.lines.map(l => l.length))

  return (
    <div style={{
      borderRadius: 16,
      border: '1px solid var(--border, #e8e8e8)',
      background: 'var(--surface, #fff)',
      padding: '32px 28px',
      position: 'relative',
      minHeight: 280,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div style={{
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        fontFamily: POETRY_FONT,
        fontSize: maxLineLen > 5 ? 22 : 28,
        lineHeight: 1.8,
        letterSpacing: '0.08em',
        color: 'var(--text, #1a1a1a)',
        alignSelf: 'flex-end',
        paddingRight: 8,
      }}>
        {poem.lines.map((line, i) => (
          <span key={i} style={{ display: 'block' }}>{line}</span>
        ))}
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        marginTop: 24,
        alignSelf: 'flex-start',
      }}>
        <span style={{
          writingMode: 'vertical-rl',
          fontFamily: POETRY_FONT,
          fontSize: 14,
          color: 'var(--text-muted, #888)',
          letterSpacing: '0.1em',
        }}>
          {poem.author}
        </span>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 3,
          background: '#c0392b',
          color: '#fff',
          fontSize: 10,
          fontFamily: POETRY_FONT,
          fontWeight: 600,
        }}>
          {poem.tag}
        </span>
      </div>
    </div>
  )
}
