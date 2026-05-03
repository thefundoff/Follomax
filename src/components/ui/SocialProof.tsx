import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useServices } from '@/hooks/useServices'
import { getPlatformIcon } from '@/lib/utils'

const NAMES = [
  'James O.', 'Amara K.', 'Lucas M.', 'Sofia R.', 'David N.', 'Chloe A.',
  'Ethan B.', 'Nadia F.', 'Marcus T.', 'Leila H.', 'Ryan C.', 'Zara P.',
  'Samuel W.', 'Fatima D.', 'Oliver J.', 'Priya S.', 'Aaron L.', 'Mei X.',
  'Jordan E.', 'Yemi A.', 'Tyler G.', 'Aisha M.', 'Nathan V.', 'Elena K.',
  'Kevin I.', 'Sara O.', 'Derek U.', 'Nina B.', 'Hassan Q.', 'Clara W.',
  'Tobias R.', 'Ling C.', 'Felix Z.', 'Rania Y.', 'Caleb J.', 'Vera T.',
  'Idris P.', 'Mia L.', 'Ben F.', 'Layla N.', 'Charles E.', 'Demi S.',
  'Kwame O.', 'Isabel V.', 'Theo H.', 'Aliyah G.', 'Max D.', 'Sana R.',
  'Joel A.', 'Tiana C.', 'Hugo M.', 'Nora B.', 'Chris W.', 'Ada I.',
  'Leon K.', 'Zoe Q.', 'Finn T.', 'Lana E.', 'Kofi J.', 'Diana U.',
  'Andre P.', 'Yasmin T.', 'Blake H.', 'Rima S.', 'Oscar N.', 'Jade M.',
  'Tariq L.', 'Grace E.', 'Elias B.', 'Hana W.', 'Vincent R.', 'Nia C.',
  'Damien O.', 'Lena F.', 'Raphael K.', 'Amina J.', 'Seth G.', 'Iris D.',
  'Malik A.', 'Ruby V.', 'Bruno Z.', 'Sadie T.', 'Cyrus H.', 'Tara N.',
  'Emmanuel S.', 'Freya L.', 'Anton W.', 'Zainab R.', 'Caden I.', 'Selene P.',
  'Winston B.', 'Naomi U.', 'Erick M.', 'Lydia F.', 'Jabari K.', 'Phoebe A.',
  'Stefan Q.', 'Adaeze C.', 'Owen T.', 'Bianca H.', 'Ibrahim D.', 'Cassidy O.',
  'Roman J.', 'Kezia S.', 'Darius W.', 'Moana L.', 'Pierre G.', 'Aaliyah E.',
  'Marco V.', 'Sasha N.', 'Rashid B.', 'Ellie R.', 'Santiago K.', 'Imani F.',
  'Luca T.', 'Vivian O.', 'Hamza C.', 'Penelope M.', 'Jalen H.', 'Soraya A.',
  'Patrick Z.', 'Chiara U.', 'Moses D.', 'Hannah J.', 'Rafael S.', 'Ola G.',
  'Dominic W.', 'Yuna L.', 'Obi N.', 'Stella B.', 'Fabian R.', 'Kemi T.',
  'Arjun P.', 'Serena I.', 'Emeka V.', 'Rosa H.', 'Nico F.', 'Thandie O.',
  'Julian C.', 'Blessing K.', 'Adrian E.', 'Mabel W.', 'Yousef M.', 'Ingrid S.',
  'Ezra D.', 'Precious A.', 'Conrad T.', 'Wren J.', 'Silas B.', 'Nkechi R.',
  'Alexei G.', 'Carmen L.', 'Tobenna O.', 'Hazel F.', 'Remi N.', 'Elara H.',
  'Adrien K.', 'Zinnia S.', 'Chidi M.', 'Rosie W.', 'Kian P.', 'Femi A.',
  'Brice T.', 'Davina E.', 'Solomon J.', 'Thea V.', 'Ade C.', 'Pippa U.',
  'Jude R.', 'Ngozi B.', 'Caspian L.', 'Olive D.', 'Kweku O.', 'Lila F.',
  'Lionel G.', 'Abena M.', 'Flynn H.', 'Miriam T.', 'Yusuf S.', 'Scarlett K.',
  'Emil A.', 'Chisom W.', 'Noel R.', 'Tamara J.', 'Bakari N.', 'Astrid C.',
  'Matteo P.', 'Adanna I.', 'Tobias V.', 'Fiona E.', 'Segun L.', 'Margot B.',
  'Reuben O.', 'Zuri F.', 'Clement H.', 'Nadia M.', 'Ifeanyi T.', 'Cora S.',
]

// Fallback services used before DB loads
const FALLBACK_SERVICES = [
  { name: 'Instagram Followers', icon: '📸' },
  { name: 'TikTok Likes', icon: '🎵' },
  { name: 'YouTube Views', icon: '▶️' },
  { name: 'Facebook Page Likes', icon: '👍' },
  { name: 'Twitter Followers', icon: '🐦' },
  { name: 'Instagram Likes', icon: '❤️' },
  { name: 'YouTube Subscribers', icon: '🔔' },
  { name: 'TikTok Followers', icon: '🎶' },
  { name: 'WhatsApp Channel Members', icon: '💬' },
  { name: 'Telegram Members', icon: '✈️' },
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface Notification {
  id: number
  name: string
  serviceName: string
  icon: string
}

export function SocialProof() {
  const { data: services } = useServices()
  const servicesRef = useRef(services)
  const [notification, setNotification] = useState<Notification | null>(null)
  const nameQueue = useRef<string[]>([])
  const counter = useRef(0)

  // Keep servicesRef in sync so the timer callback always sees the latest data
  useEffect(() => { servicesRef.current = services }, [services])

  useEffect(() => {
    let cancelled = false

    const getNextName = () => {
      if (nameQueue.current.length === 0) nameQueue.current = shuffle(NAMES)
      return nameQueue.current.pop()!
    }

    const getRandomService = () => {
      const list = servicesRef.current
      if (list?.length) {
        const s = list[Math.floor(Math.random() * list.length)]
        return { serviceName: s.name, icon: s.categories?.icon || getPlatformIcon(s.name) }
      }
      const s = FALLBACK_SERVICES[Math.floor(Math.random() * FALLBACK_SERVICES.length)]
      return { serviceName: s.name, icon: s.icon }
    }

    const show = () => {
      if (cancelled) return
      const { serviceName, icon } = getRandomService()
      setNotification({ id: ++counter.current, name: getNextName(), serviceName, icon })

      setTimeout(() => {
        if (cancelled) return
        setNotification(null)
        setTimeout(show, 8000 + Math.random() * 7000)
      }, 4000)
    }

    const t = setTimeout(show, 4000 + Math.random() * 4000)
    return () => { cancelled = true; clearTimeout(t) }
  }, [])

  return (
    <div className="fixed bottom-5 left-5 z-40 pointer-events-none">
      <AnimatePresence>
        {notification && (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, x: -20, y: 4 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="flex items-center gap-2.5 bg-navy-800/90 backdrop-blur-md border border-navy-500/40 rounded-2xl px-3.5 py-2.5 shadow-lg max-w-[240px]"
          >
            <div className="w-7 h-7 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-brand-400">{notification.name.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-200 leading-snug">
                <span className="font-semibold text-white">{notification.name}</span> just bought
              </p>
              <p className="text-xs text-gray-400 truncate">
                {notification.icon} {notification.serviceName}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
